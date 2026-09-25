/**
 * Drive Discovery session state: active session per user, last story time, next POI, mute.
 */
import type {
  DiscoveryMode,
  DiscoveryDecision,
  DrivePingResult,
  NarrativePlan,
  StoryFinishReason,
  StoryFinishResult,
} from '@heycity/shared';
import { randomUUID } from 'node:crypto';
import { discoveryConfig, driveDiscovery, poi, aheadDiscovery as discoverySettings, journeyMemory } from '../config';
import { discoveryEvidence } from './discoveryKnowledge';
import { EvidenceBundle, InsufficientEvidenceError, normalizeEvidence, publicAttribution, specificCallbackTopics, storyAvailability } from './evidence';
import type { StoryContinuationState } from './storyBrief';
import type { DiscoveryCandidate as StoryCandidate } from './driveDecision';
import { NearbyPlace } from './googlePlaces';
import { isCircuitOpen } from './budget';
import { wasPoiListenedRecently } from './history';
import { recordJourneyHistory } from './history';
import { createJourneyState, JourneyState } from './journeyContext';
import { distanceMeters, encodeGeohash, headingBucket, speedBucket } from './geo';
import { recordExperienceDecision, recordExperienceEvent, ExperienceDecisionEvent } from './usage';
import { evaluateDiscoveryDecision, getPingSkipReason } from './driveDecision';
import { findLocalPoiCandidates, localCandidateToNearbyPlace } from './localPoi';
import { prepareNarrative } from './narrativePlan';
import { generateNarrationFromPlan } from './narration';
import {
  clearAheadDiscoverySession,
  createMovementContext,
  evaluateAheadDiscovery,
} from './aheadDiscovery';

export interface DriveSessionParams {
  mode?: DiscoveryMode;
  autoMode?: boolean;
  themeTags: string[];
  narrationStyle: string;
  lengthSec: number;
  leadTimeMin: number;
  voiceId: string;
  language: string;
  autoplay: boolean;
}

export interface DriveSession {
  id: string;
  userId: string;
  params: DriveSessionParams;
  muted: boolean;
  startedAt: string;
  lastPlacesAt: number;
  lastMatrixAt: number;
  lastStoryStartedAt: number;
  lastCandidates: NearbyPlace[];
  alreadyListening: boolean;
  storyRequest?: AbortController;
  storyContinuation?: StoryContinuationState;
  journeyState: JourneyState;
  lastExperienceDecision?: string;
  lastExperienceAtMs?: number;
  lastDecisionCandidates?: ExperienceDecisionEvent['candidates'];
  areaAnchor?: { latitude: number; longitude: number };
  spokenProviderIds?: Set<string>;
  knowledgeOffset?: number;
  pendingMode?: DiscoveryMode;
  pendingModeSamples: number;
  nextPoi?: {
    place: NearbyPlace;
    etaSec: number;
    distanceM?: number;
  };
}

const sessions = new Map<string, DriveSession>();

export function createSession(userId: string, params: DriveSessionParams): DriveSession {
  const id = `drive_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const session: DriveSession = {
    id,
    userId,
    params,
    muted: false,
    startedAt: new Date().toISOString(),
    lastPlacesAt: 0,
    lastMatrixAt: 0,
    lastStoryStartedAt: 0,
    lastCandidates: [],
    alreadyListening: false,
    pendingModeSamples: 0,
    journeyState: createJourneyState(id, {
      entities: journeyMemory.recentEntities, topics: journeyMemory.recentTopics,
      outcomes: journeyMemory.recentOutcomes, questions: journeyMemory.recentQuestions,
      callbacks: journeyMemory.callbacks, evidenceRefs: journeyMemory.usedEvidenceRefs,
      callbackMinCompletedGap: journeyMemory.callbackMinCompletedGap,
      narrativeSignatures: journeyMemory.narrativeSignatures, areaTtlMs: journeyMemory.areaTtlMs,
    }),
  };
  sessions.set(id, session);
  return session;
}

export function updateSessionMode(session: DriveSession, speedKmh: number): DiscoveryMode {
  const currentMode = session.params.mode ?? 'vehicle';
  if (!session.params.autoMode) return currentMode;
  if (!Number.isFinite(speedKmh) || speedKmh < 0) return currentMode;

  const candidateMode = currentMode === 'walking'
    ? (speedKmh >= discoveryConfig.vehicleMinSpeedKmh ? 'vehicle' : 'walking')
    : (speedKmh <= discoveryConfig.walkingMaxSpeedKmh ? 'walking' : 'vehicle');

  if (candidateMode === currentMode) {
    session.pendingMode = undefined;
    session.pendingModeSamples = 0;
    return currentMode;
  }

  if (session.pendingMode === candidateMode) {
    session.pendingModeSamples += 1;
  } else {
    session.pendingMode = candidateMode;
    session.pendingModeSamples = 1;
  }

  if (session.pendingModeSamples < discoveryConfig.modeSwitchConfirmSamples) return currentMode;

  session.params.mode = candidateMode;
  session.pendingMode = undefined;
  session.pendingModeSamples = 0;
  return candidateMode;
}

export function getSession(sessionId: string): DriveSession | null {
  return sessions.get(sessionId) ?? null;
}

export function stopSession(sessionId: string): boolean {
  sessions.get(sessionId)?.storyRequest?.abort();
  sessions.get(sessionId)?.journeyState.markSuperseded();
  clearAheadDiscoverySession(sessionId);
  return sessions.delete(sessionId);
}

export function setMuted(sessionId: string, muted: boolean): void {
  const s = sessions.get(sessionId);
  if (s) s.muted = muted;
}

export async function finishActiveStory(
  sessionId: string,
  reason: StoryFinishReason = 'ended',
  momentId?: string,
  listenedSeconds?: number,
): Promise<StoryFinishResult | null> {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const activeStoryWasPlaying = session.alreadyListening;
  const moment = session.journeyState.getActiveMoment();
  if (!moment || !momentId || moment.momentId !== momentId) {
    return {ok:false,stale:true,activeStoryWasPlaying:false,reason};
  }
  session.alreadyListening = false;
  session.nextPoi = undefined;
  if (moment) {
    session.journeyState.finishStory({ momentId: moment.momentId, reason: reason === 'ended' ? 'completed' : reason,
      listenedSeconds: Number.isFinite(listenedSeconds) && (listenedSeconds ?? 0) >= 0 ? Math.min(86400, listenedSeconds!) : undefined });
    if (reason === 'ended' && moment.level === 'long') session.storyContinuation = undefined;
    const snap = session.journeyState.getSnapshot();
    if (reason === 'ended') {
      if (moment.callbackId) session.journeyState.recordCallbackUsed(moment.callbackId);
      await recordJourneyHistory(session.userId, {
        poiId: moment.entityId, placeId: moment.entityId,
        mode: session.params.mode === 'walking' ? 'walking' : 'drive_discovery',
        theme: session.params.themeTags[0], style: session.params.narrationStyle,
        metadata: { momentId: moment.momentId, storyLevel: moment.level, outcome: 'completed',
          topicKeys: [...moment.topicKeys], evidenceRefs: [...moment.evidenceRefs],
          guideId: session.params.voiceId,
          area: snap.area.source === 'unknown' ? undefined : { ...snap.area },
        },
      });
    }
    await recordExperienceEvent('story_outcome', experienceEvent(session, {
      type: 'trigger_story', selectedTargetId: moment.entityId,
      outcome: reason,
    }, 0, new Date().toISOString(), listenedSeconds), session.userId);
    if (reason === 'ended' && moment.callbackId) await recordExperienceEvent('callback_used',
      experienceEvent(session, {type:'trigger_story',selectedTargetId:moment.entityId,
        momentRelationship:'callback'}), session.userId);
  }
  if (reason !== 'ended') session.storyContinuation = undefined;

  return {
    ok: true,
    activeStoryWasPlaying,
    reason,
  };
}

export interface PingResult extends Omit<DrivePingResult, 'poi'> {
  poi?: NearbyPlace;
  suggestedPoiId?: string;
}

export async function pingSession(
  sessionId: string,
  lat: number,
  lng: number,
  heading: number | null,
  speedKmh: number,
  timestamp: number,
  accuracyMeters?: number,
  forceAheadRefresh = false,
  discoveryOnly = false
): Promise<PingResult> {
  const session = sessions.get(sessionId);
  if (!session) {
    return { nextAction: 'NONE' };
  }

  const now = timestamp || Date.now();
  const activeMode = updateSessionMode(session, speedKmh);
  const movement = createMovementContext({
    latitude: lat,
    longitude: lng,
    headingDegrees: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
    speedKmh,
    accuracyMeters,
    timestampMs: now,
  });
  const aheadDiscovery = await evaluateAheadDiscovery({
    sessionId,
    movement,
    forceRefresh: forceAheadRefresh,
    nowMs: now,
  });
  if (sessions.get(sessionId) !== session) return {nextAction:'NONE'};
  const at = new Date(now).toISOString();
  session.journeyState.updateMovement({mode: activeMode, latitude: lat, longitude: lng,
    headingDegrees: heading ?? undefined, speedKmh, observedAt: at});
  const areaCandidates = aheadDiscovery.topCandidates
    .filter(candidate => ['city', 'town', 'locality', 'region'].includes(candidate.targetType) &&
      candidate.distanceMeters <= discoverySettings.cityContextRadiusMeters)
    .map(candidate => ({
      ...(candidate.targetType === 'region' ? {region: candidate.name} :
        candidate.targetType === 'city' ? {city: candidate.name} : {locality: candidate.name}),
      areaType: candidate.targetType, source: 'discovery' as const, distanceMeters: candidate.distanceMeters,
    }));
  if (areaCandidates.length) {
    session.journeyState.updateAreaFromCandidates(areaCandidates, at);
    session.areaAnchor = {latitude: lat, longitude: lng};
  } else if (session.areaAnchor && distanceMeters(session.areaAnchor.latitude, session.areaAnchor.longitude, lat, lng) > journeyMemory.areaMoveMeters) {
    session.journeyState.updateArea({source:'unknown'}, at);
    session.areaAnchor = undefined;
  }
  if (discoveryOnly) {
    const suggested = !session.alreadyListening && !session.storyRequest &&
      !session.muted && !isCircuitOpen(session.userId) &&
      (!session.lastStoryStartedAt || now-session.lastStoryStartedAt >= discoveryConfig.discoveryCooldownSeconds*1000)
      ? aheadDiscovery.topCandidates.find(c => !session.spokenProviderIds?.has(c.providerId) &&
        (c.distanceMeters <= driveDiscovery.fallbackDistanceM ||
         c.distanceMeters / Math.max(speedKmh/3.6,1) <= session.params.leadTimeMin*60 ||
         (c.targetType === 'city' && c.distanceMeters <= discoverySettings.cityContextRadiusMeters))) : undefined;
    return {nextAction:'NONE', mode:activeMode, speedKmh, aheadDiscovery,suggestedPoiId:suggested?.providerId};
  }
  if (session.pendingMode) {
    return { nextAction: 'NONE', mode: activeMode, speedKmh, aheadDiscovery };
  }
  if (session.storyRequest) {
    return {nextAction:'NONE',mode:activeMode,speedKmh,aheadDiscovery,
      decision:{type:'hold',reason:'already_listening'}};
  }
  const userId = session.userId;
  const circuitOpen = isCircuitOpen(userId);
  const skipReason = activeMode === 'walking'
    ? (circuitOpen ? 'circuit_open' : session.muted ? 'muted' : null)
    : getPingSkipReason({ circuitOpen, muted: session.muted, speedKmh });
  if (skipReason) {
    return {
      nextAction: 'NONE',
      mode: activeMode,
      speedKmh,
      circuitLimited: skipReason === 'circuit_open',
      decision: {
        type: 'hold',
        reason: skipReason === 'circuit_open' ? 'budget_guardrail' : 'speed_too_low',
      },
      aheadDiscovery,
    };
  }

  const leadTimeSec = session.params.leadTimeMin * 60;
  const localCandidates = await Promise.all(
    findLocalPoiCandidates({
      lat,
      lng,
      speedKmh,
      themeTags: session.params.themeTags,
      limit: poi.kDestinations,
    }).map(async (candidate) => ({
      ...candidate,
      listenedRecently: await wasPoiListenedRecently(
        userId,
        candidate.poiId,
        poi.repeatCooldownHours
      ),
    }))
  );

  const live = [...aheadDiscovery.topCandidates].sort((a, b) =>
    Number(b.targetType === 'city') - Number(a.targetType === 'city'));
  const livePlaces = new Map(live.map(candidate => [candidate.providerId, {
    place_id: candidate.providerId, name: candidate.name, types: candidate.providerTypes,
    geometry: { location: { lat: candidate.latitude, lng: candidate.longitude } },
  }]));
  const storyCandidates: StoryCandidate[] = [];
  const evidenceByPoi = new Map<string, EvidenceBundle>();
  // Retrieve facts only for a bounded shortlist when a new story can start.
  if (!session.alreadyListening && (!session.lastStoryStartedAt || now - session.lastStoryStartedAt >= discoveryConfig.discoveryCooldownSeconds * 1000)) {
    const offset = session.knowledgeOffset ?? 0;
    const pendingKnowledge = [...live.slice(offset), ...live.slice(0, offset)];
    let attempts = 0;
    const eligible: typeof live = [];
    for (const candidate of pendingKnowledge) {
      if (session.spokenProviderIds?.has(candidate.providerId) || await wasPoiListenedRecently(userId, candidate.providerId, poi.repeatCooldownHours)) continue;
      const isCityContext = candidate.targetType === 'city' && candidate.distanceMeters <= discoverySettings.cityContextRadiusMeters;
      const eta = candidate.distanceMeters / Math.max(speedKmh / 3.6, 1);
      if (!isCityContext && candidate.distanceMeters > driveDiscovery.fallbackDistanceM && eta > leadTimeSec) continue;
      if (attempts++ >= discoverySettings.knowledgeCandidateLimit) break;
      eligible.push(candidate);
    }
    // Start the bounded free knowledge lookups together, retain deterministic priority.
    const seeds = eligible.map(candidate => discoveryEvidence(candidate));
    for (let i = 0; i < eligible.length; i++) {
      const candidate = eligible[i];
      const isCityContext = candidate.targetType === 'city' && candidate.distanceMeters <= discoverySettings.cityContextRadiusMeters;
      const eta = candidate.distanceMeters / Math.max(speedKmh / 3.6, 1);
      session.knowledgeOffset = (live.indexOf(candidate) + 1) % Math.max(1, live.length);
      const evidence = await seeds[i];
      if (!evidence || !storyAvailability(evidence).short) continue;
      evidenceByPoi.set(candidate.providerId, evidence);
      storyCandidates.push({ poiId: candidate.providerId, placeName: candidate.name,
        distanceMeters: isCityContext ? 0 : candidate.distanceMeters,
        etaSeconds: isCityContext ? undefined : eta });
      break;
    }
  }
  for (const candidate of localCandidates) {
    const evidence = normalizeEvidence({ id: candidate.poiId, name: candidate.placeName, category: 'curated_place' }, candidate.storySeed ?? '', 'curated');
    if (storyAvailability(evidence).short) { evidenceByPoi.set(candidate.poiId, evidence); storyCandidates.push(candidate); }
  }
  session.lastCandidates = [...livePlaces.values(), ...localCandidates.map(localCandidateToNearbyPlace)];
  session.lastDecisionCandidates = storyCandidates.slice(0, 12).map(candidate => ({
    id: candidate.poiId,
    distanceBucket: candidate.distanceMeters < 500 ? 'near' : candidate.distanceMeters < 3000 ? 'mid' : 'far',
  }));

  const decision = evaluateDiscoveryDecision({
    mode: activeMode,
    speedKmh,
    gpsAgeSeconds: 0,
    alreadyListening: session.alreadyListening,
    budgetGuardrail: false,
    lastStoryStartedAtMs: session.lastStoryStartedAt,
    nowMs: now,
    leadTimeSec,
    guideId: session.params.voiceId,
    themeTags: session.params.themeTags,
    candidates: storyCandidates,
    targetDurationSec: session.params.lengthSec,
  });

  if (decision.type === 'hold') {
    await recordDecisionIfChanged(session, {type:'hold',holdReason:decision.reason}, now, storyCandidates.length);
    return { nextAction: 'NONE', mode: activeMode, speedKmh, decision, aheadDiscovery };
  }

  const place = livePlaces.get(decision.poiId) ?? localCandidateToNearbyPlace({
    poiId: decision.poiId,
    placeName: decision.narrativePlanInput.placeName,
    distanceMeters: decision.distanceMeters,
    etaSeconds: decision.etaSeconds,
    storySeed: decision.narrativePlanInput.storySeed,
  });
  const selectedEvidence = evidenceByPoi.get(decision.poiId)!;
  const topicKeys = [...new Set([...session.params.themeTags.filter(tag => tag !== 'mixed'), selectedEvidence.category, ...specificCallbackTopics(selectedEvidence)])];
  session.journeyState.selectCallback({entityId:decision.poiId,topicKeys,at});
  let planned;
  try {
    planned = prepareNarrative(decision.narrativePlanInput, selectedEvidence,
      { level: 'auto', language: session.params.language, journey: session.journeyState.getSnapshot(at) });
  } catch (error) {
    if (!(error instanceof InsufficientEvidenceError)) throw error;
    await recordDecisionIfChanged(session, {type:'hold',holdReason:'anti_repeat'}, now, storyCandidates.length);
    return { nextAction:'NONE',mode:activeMode,speedKmh,decision:{type:'hold',reason:'anti_repeat'},aheadDiscovery };
  }
  const { plan: narrativePlan, brief, policy } = planned;
  if (session.storyRequest || sessions.get(sessionId) !== session) {
    return {nextAction:'NONE',mode:activeMode,speedKmh,aheadDiscovery,
      decision:{type:'hold',reason:'already_listening'}};
  }
  // The public decision carries product fields, never legacy source prose.
  delete decision.narrativePlanInput.storySeed;
  const request = new AbortController();
  session.storyRequest = request;
  session.alreadyListening = true;
  let narration;
  try {
    narration = await generateNarrationFromPlan(narrativePlan, {
      brief, policy, language: session.params.language,
      narrationStyle: session.params.narrationStyle, userId, signal: request.signal,
    });
    request.signal.throwIfAborted();
    if (sessions.get(sessionId) !== session || session.storyRequest !== request) throw new Error('Story request superseded');
  } catch (error) {
    if (request.signal.aborted || sessions.get(sessionId) !== session || session.storyRequest !== request)
      return {nextAction:'NONE',mode:activeMode,speedKmh,aheadDiscovery,
        decision:{type:'hold',reason:'already_listening'}};
    throw error;
  } finally {
    if (session.storyRequest === request) {
      session.storyRequest = undefined;
      if (!narration) session.alreadyListening = false;
    }
  }
  session.storyContinuation = undefined;

  const momentId = `moment_${randomUUID()}`;
  session.journeyState.startStory({momentId,entityId:decision.poiId,entityName:place.name,
    category:selectedEvidence.category,level:'auto',guideId:policy.id,callbackId:brief.journey?.callback?.id,startedAt:at});
  session.journeyState.recordNarration({momentId,evidenceRefs:brief.selectedEvidenceRefs,topicKeys,
    narrativeSignature:`${policy.id}:${brief.moment.relationship}:${brief.moment.intent}:${brief.beats.map(beat=>beat.kind).join(',')}`,at});

  session.nextPoi = {
    place,
    etaSec: decision.etaSeconds ?? 999999,
    distanceM: decision.distanceMeters,
  };
  session.lastStoryStartedAt = now;
  session.alreadyListening = Boolean(narration.audioUrl);
  (session.spokenProviderIds ??= new Set()).add(decision.poiId);

  await recordDecisionIfChanged(session, {type:'trigger_story',selectedTargetId:decision.poiId,
    triggerReason:decision.triggerReason,momentRelationship:brief.moment.relationship},now,storyCandidates.length);
  await recordExperienceEvent('story_started', experienceEvent(session,
    {type:'trigger_story',selectedTargetId:decision.poiId}), userId);
  if (sessions.get(sessionId) !== session || session.journeyState.getActiveMoment()?.momentId !== momentId)
    return {nextAction:'NONE',mode:activeMode,speedKmh,aheadDiscovery,
      decision:{type:'hold',reason:'already_listening'}};

  return {
    nextAction: 'PLAY',
    momentId,
    mode: activeMode,
    speedKmh,
    poi: place,
    audioUrl: narration.audioUrl,
    textPreview: narration.transcriptText.slice(0, 200),
    decision,
    narrativePlan,
    transcriptText: narration.transcriptText,
    estimatedDurationSec: narration.estimatedDurationSec,
    attribution: publicAttribution(selectedEvidence),
    aheadDiscovery,
  };
}

function experienceEvent(session: DriveSession, decision: {
  type: 'hold' | 'trigger_story'; selectedTargetId?: string; triggerReason?: string;
  holdReason?: string; momentRelationship?: string; outcome?: StoryFinishReason | 'superseded';
}, candidateDensity = 0, at = new Date().toISOString(), listenedSeconds?: number): ExperienceDecisionEvent {
  const movement = session.journeyState.getSnapshot(at).movement;
  return {
    sessionId: session.id, at,
    context: {
      movementMode: movement?.mode ?? session.params.mode ?? 'vehicle',
      locationBucket: movement ? encodeGeohash(movement.latitude, movement.longitude, 5) : 'unknown',
      headingBucket: movement?.headingDegrees === undefined ? undefined : headingBucket(movement.headingDegrees),
      speedBucket: movement?.speedKmh === undefined ? undefined : speedBucket(movement.speedKmh),
      areaType: session.journeyState.getSnapshot(at).area.areaType,
      candidateDensity,
    },
    candidates: session.lastDecisionCandidates ?? [],
    decision: { type: decision.type, selectedTargetId: decision.selectedTargetId,
      triggerReason: decision.triggerReason, holdReason: decision.holdReason,
      momentRelationship: decision.momentRelationship },
    outcome: decision.outcome ? {
      completed: decision.outcome === 'ended', skipped: decision.outcome === 'skipped',
      paused: decision.outcome === 'paused',
      superseded: decision.outcome === 'superseded',
      listenedSeconds: Number.isFinite(listenedSeconds) ? listenedSeconds : undefined,
    } : undefined,
  };
}

async function recordDecisionIfChanged(session: DriveSession, decision: Parameters<typeof experienceEvent>[1],
  atMs: number, candidateDensity: number): Promise<void> {
  const key = `${decision.type}:${decision.selectedTargetId ?? decision.holdReason ?? ''}`;
  if (session.lastExperienceDecision === key && decision.type === 'hold') return;
  if (decision.type === 'hold' && session.lastExperienceAtMs !== undefined &&
      atMs - session.lastExperienceAtMs < journeyMemory.decisionTelemetryMinMs) return;
  session.lastExperienceDecision = key;
  session.lastExperienceAtMs = atMs;
  await recordExperienceDecision(experienceEvent(session, decision, candidateDensity, new Date(atMs).toISOString()), session.userId);
}

/** Explicit selection shares the same bounded product telemetry boundary as automatic narration. */
export async function recordSessionStoryStarted(session: DriveSession, poiId: string): Promise<void> {
  await recordExperienceEvent('story_started', experienceEvent(session,
    {type:'trigger_story',selectedTargetId:poiId}), session.userId);
}

export async function recordSessionSuperseded(session: DriveSession, entityId: string): Promise<void> {
  await recordExperienceEvent('story_outcome', experienceEvent(session,
    {type:'trigger_story',selectedTargetId:entityId,outcome:'superseded'}), session.userId);
}
