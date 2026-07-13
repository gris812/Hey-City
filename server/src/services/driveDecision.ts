import type { DiscoveryDecision, DiscoveryMode, NarrativePlanInput } from '@heycity/shared';
import { discoveryConfig, driveDiscovery, speedThresholds } from '../config';

export type PingSkipReason =
  | 'circuit_open'
  | 'muted'
  | 'below_vehicle_speed';

export interface PingGateInput {
  circuitOpen: boolean;
  muted: boolean;
  speedKmh: number;
}

export function getPingSkipReason(input: PingGateInput): PingSkipReason | null {
  if (input.circuitOpen) return 'circuit_open';
  if (input.muted) return 'muted';
  if (input.speedKmh < speedThresholds.minVehicleKmh) return 'below_vehicle_speed';
  return null;
}

export interface CandidateRefreshInput {
  nowMs: number;
  lastPlacesAtMs: number;
  canMakePlacesCall: boolean;
  hasCachedCandidates: boolean;
}

export function shouldRefreshCandidates(input: CandidateRefreshInput): boolean {
  const placesRefreshMs = driveDiscovery.placesRefreshSec * 1000;
  if (!input.canMakePlacesCall) return false;
  if (!input.hasCachedCandidates) return true;
  return input.nowMs - input.lastPlacesAtMs >= placesRefreshMs;
}

export interface StoryTriggerInput {
  etaSec: number;
  leadTimeSec: number;
  lastStoryStartedAtMs: number;
  nowMs: number;
}

export function shouldTriggerStory(input: StoryTriggerInput): boolean {
  if (input.etaSec < driveDiscovery.minEtaSecToStart) return false;
  if (input.etaSec > input.leadTimeSec) return false;

  const minGapMs = driveDiscovery.minGapBetweenStoriesSec * 1000;
  if (
    input.lastStoryStartedAtMs > 0 &&
    input.nowMs - input.lastStoryStartedAtMs < minGapMs
  ) {
    return false;
  }

  return true;
}

export interface DiscoveryCandidate {
  poiId: string;
  placeName: string;
  distanceMeters: number;
  etaSeconds?: number;
  storySeed?: string;
  listenedRecently?: boolean;
}

export interface EvaluateDiscoveryInput {
  mode: DiscoveryMode;
  speedKmh: number;
  gpsAgeSeconds: number;
  alreadyListening: boolean;
  budgetGuardrail: boolean;
  lastStoryStartedAtMs: number;
  nowMs: number;
  leadTimeSec: number;
  guideId: string;
  themeTags: string[];
  candidates: DiscoveryCandidate[];
  targetDurationSec?: number;
}

export function evaluateDiscoveryDecision(input: EvaluateDiscoveryInput): DiscoveryDecision {
  if (input.gpsAgeSeconds > discoveryConfig.gpsStaleSeconds) {
    return { type: 'hold', reason: 'bad_gps' };
  }
  if (input.budgetGuardrail) {
    return { type: 'hold', reason: 'budget_guardrail' };
  }
  if (input.alreadyListening) {
    return { type: 'hold', reason: 'already_listening' };
  }
  if (input.mode === 'vehicle' && input.speedKmh < discoveryConfig.vehicleMinSpeedKmh) {
    return { type: 'hold', reason: 'speed_too_low' };
  }
  if (
    input.lastStoryStartedAtMs > 0 &&
    input.nowMs - input.lastStoryStartedAtMs < discoveryConfig.discoveryCooldownSeconds * 1000
  ) {
    return { type: 'hold', reason: 'cooldown_active' };
  }

  const available = input.candidates.filter((candidate) => !candidate.listenedRecently);
  if (input.candidates.length > 0 && available.length === 0) {
    return { type: 'hold', reason: 'anti_repeat' };
  }

  for (const candidate of available) {
    const triggerReason = getTriggerReason(candidate, input.leadTimeSec);
    if (!triggerReason) continue;

    return {
      type: 'trigger_story',
      poiId: candidate.poiId,
      triggerReason,
      etaSeconds: candidate.etaSeconds,
      distanceMeters: candidate.distanceMeters,
      mode: input.mode,
      narrativePlanInput: {
        poiId: candidate.poiId,
        placeName: candidate.placeName,
        mode: input.mode,
        guideId: input.guideId,
        themeTags: input.themeTags,
        storySeed: candidate.storySeed,
        targetDurationSec:
          input.targetDurationSec ??
          (input.mode === 'vehicle'
            ? discoveryConfig.vehicleStoryMaxSeconds
            : 90),
      },
    };
  }

  return { type: 'hold', reason: 'no_candidate' };
}

function getTriggerReason(
  candidate: DiscoveryCandidate,
  leadTimeSec: number
): 'eta' | 'distance' | null {
  if (
    candidate.etaSeconds !== undefined &&
    candidate.etaSeconds >= driveDiscovery.minEtaSecToStart &&
    candidate.etaSeconds <= leadTimeSec
  ) {
    return 'eta';
  }

  if (candidate.distanceMeters <= driveDiscovery.fallbackDistanceM) {
    return 'distance';
  }

  return null;
}
