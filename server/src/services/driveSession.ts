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
import { discoveryConfig, poi } from '../config';
import { getUserById } from './user';
import { NearbyPlace } from './googlePlaces';
import { isCircuitOpen } from './budget';
import { wasPoiListenedRecently } from './history';
import { addToHistory } from './history';
import { evaluateDiscoveryDecision, getPingSkipReason } from './driveDecision';
import { findLocalPoiCandidates, localCandidateToNearbyPlace } from './localPoi';
import { createNarrativePlan } from './narrativePlan';
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
  clearAheadDiscoverySession(sessionId);
  return sessions.delete(sessionId);
}

export function setMuted(sessionId: string, muted: boolean): void {
  const s = sessions.get(sessionId);
  if (s) s.muted = muted;
}

export function finishActiveStory(
  sessionId: string,
  reason: StoryFinishReason = 'ended'
): StoryFinishResult | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const activeStoryWasPlaying = session.alreadyListening;
  session.alreadyListening = false;
  session.nextPoi = undefined;

  return {
    ok: true,
    activeStoryWasPlaying,
    reason,
  };
}

export interface PingResult extends Omit<DrivePingResult, 'poi'> {
  poi?: NearbyPlace;
}

export async function pingSession(
  sessionId: string,
  lat: number,
  lng: number,
  heading: number | null,
  speedKmh: number,
  timestamp: number,
  accuracyMeters?: number,
  forceAheadRefresh = false
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
  if (session.pendingMode) {
    return { nextAction: 'NONE', mode: activeMode, speedKmh, aheadDiscovery };
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

  session.lastCandidates = localCandidates.map(localCandidateToNearbyPlace);

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
    candidates: localCandidates,
    targetDurationSec: session.params.lengthSec,
  });

  if (decision.type === 'hold') {
    return { nextAction: 'NONE', mode: activeMode, speedKmh, decision, aheadDiscovery };
  }

  const place = localCandidateToNearbyPlace({
    poiId: decision.poiId,
    placeName: decision.narrativePlanInput.placeName,
    distanceMeters: decision.distanceMeters,
    etaSeconds: decision.etaSeconds,
    storySeed: decision.narrativePlanInput.storySeed,
  });
  const narrativePlan = createNarrativePlan(decision.narrativePlanInput);
  const narration = await generateNarrationFromPlan(narrativePlan, {
    language: session.params.language,
    narrationStyle: session.params.narrationStyle,
    userId,
  });

  session.nextPoi = {
    place,
    etaSec: decision.etaSeconds ?? 999999,
    distanceM: decision.distanceMeters,
  };
  session.lastStoryStartedAt = now;
  session.alreadyListening = true;

  const user = await getUserById(userId);
  if (user?.historyEnabled) {
    await addToHistory(userId, {
      type: 'poi_listened',
      placeId: place.place_id,
      poiId: place.place_id,
      mode: activeMode === 'walking' ? 'walking' : 'drive_discovery',
      theme: session.params.themeTags[0],
      style: session.params.narrationStyle,
    });
  }

  return {
    nextAction: 'PLAY',
    mode: activeMode,
    speedKmh,
    poi: place,
    audioUrl: narration.audioUrl,
    textPreview: narration.transcriptText.slice(0, 200),
    decision,
    narrativePlan,
    transcriptText: narration.transcriptText,
    estimatedDurationSec: narration.estimatedDurationSec,
    aheadDiscovery,
  };
}
