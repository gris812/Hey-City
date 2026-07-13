/**
 * Drive Discovery session state: active session per user, last story time, next POI, mute.
 */
import type {
  DiscoveryDecision,
  DrivePingResult,
  NarrativePlan,
  StoryFinishReason,
  StoryFinishResult,
} from '@heycity/shared';
import { poi } from '../config';
import { getUserById } from './user';
import { NearbyPlace } from './googlePlaces';
import { isCircuitOpen } from './budget';
import { wasPoiListenedRecently } from './history';
import { addToHistory } from './history';
import { evaluateDiscoveryDecision, getPingSkipReason } from './driveDecision';
import { findLocalPoiCandidates, localCandidateToNearbyPlace } from './localPoi';
import { createMockNarration, createNarrativePlan } from './narrativePlan';

export interface DriveSessionParams {
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
  };
  sessions.set(id, session);
  return session;
}

export function getSession(sessionId: string): DriveSession | null {
  return sessions.get(sessionId) ?? null;
}

export function stopSession(sessionId: string): boolean {
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
  heading: number,
  speedKmh: number,
  timestamp: number
): Promise<PingResult> {
  const session = sessions.get(sessionId);
  if (!session) {
    return { nextAction: 'NONE' };
  }

  const userId = session.userId;
  const circuitOpen = isCircuitOpen(userId);
  const skipReason = getPingSkipReason({
    circuitOpen,
    muted: session.muted,
    speedKmh,
  });
  if (skipReason) {
    return {
      nextAction: 'NONE',
      circuitLimited: skipReason === 'circuit_open',
      decision: {
        type: 'hold',
        reason: skipReason === 'circuit_open' ? 'budget_guardrail' : 'speed_too_low',
      },
    };
  }

  const now = timestamp || Date.now();
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
    mode: 'vehicle',
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
    return { nextAction: 'NONE', decision };
  }

  const place = localCandidateToNearbyPlace({
    poiId: decision.poiId,
    placeName: decision.narrativePlanInput.placeName,
    distanceMeters: decision.distanceMeters,
    etaSeconds: decision.etaSeconds,
    storySeed: decision.narrativePlanInput.storySeed,
  });
  const narrativePlan = createNarrativePlan(decision.narrativePlanInput);
  const narration = createMockNarration(narrativePlan);

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
      mode: 'drive_discovery',
      theme: session.params.themeTags[0],
      style: session.params.narrationStyle,
    });
  }

  return {
    nextAction: 'PLAY',
    poi: place,
    audioUrl: `mock://story/${decision.poiId}`,
    textPreview: narration.transcriptText.slice(0, 200),
    decision,
    narrativePlan,
    transcriptText: narration.transcriptText,
    estimatedDurationSec: narration.estimatedDurationSec,
  };
}
