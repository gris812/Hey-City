export type DiscoveryMode = 'walking' | 'vehicle';
export type TriggerReason = 'eta' | 'distance' | 'manual';
export type StoryFinishReason = 'ended' | 'skipped' | 'paused';

export type HoldReason =
  | 'speed_too_low'
  | 'cooldown_active'
  | 'already_listening'
  | 'no_candidate'
  | 'anti_repeat'
  | 'bad_gps'
  | 'budget_guardrail';

export type AheadDiscoveryTargetType =
  | 'city'
  | 'town'
  | 'locality'
  | 'region'
  | 'historical_landmark'
  | 'cultural_landmark'
  | 'monument'
  | 'museum'
  | 'national_park'
  | 'state_park'
  | 'park'
  | 'natural_feature'
  | 'bridge'
  | 'visitor_center'
  | 'university'
  | 'other_significant_place';

export type AheadDiscoveryHoldReason =
  | 'bad_gps'
  | 'stale_gps'
  | 'missing_heading'
  | 'provider_unavailable'
  | 'no_candidates'
  | 'no_candidate_ahead'
  | 'all_candidates_filtered'
  | 'refresh_not_due'
  | 'refresh_in_progress';

export interface MovementContext {
  latitude: number;
  longitude: number;
  headingDegrees: number | null;
  speedMps: number | null;
  accuracyMeters: number;
  timestamp: string;
}

export interface CandidateGeometry {
  distanceMeters: number;
  bearingDegrees: number;
  headingDeltaDegrees: number;
  isAhead: boolean;
}

export interface DiscoveryCandidate extends CandidateGeometry {
  providerId: string;
  provider: 'google';
  name: string;
  targetType: AheadDiscoveryTargetType;
  latitude: number;
  longitude: number;
  rating?: number;
  userRatingCount?: number;
  providerTypes: string[];
  importanceScore?: number;
}

export type AheadDiscoveryDecision =
  | {
      type: 'target_selected';
      target: DiscoveryCandidate;
      score: number;
      reasons: string[];
      refreshedAt: string;
      nextProviderRefreshAt: string;
    }
  | {
      type: 'hold';
      reason: AheadDiscoveryHoldReason;
    };

export interface AheadDiscoveryExcludedCandidate {
  providerId: string;
  name: string;
  providerTypes: string[];
  reason: string;
  distanceMeters?: number;
  headingDeltaDegrees?: number;
}

export interface AheadDiscoveryDiagnostic {
  provider: 'google';
  movement: MovementContext;
  providerRefresh: {
    configuredIntervalMinutes: number;
    lastRefreshedAt: string | null;
    nextRefreshAt: string | null;
    refreshDue: boolean;
    loading: boolean;
    forced: boolean;
    errorCode?: string;
  };
  decision: AheadDiscoveryDecision;
  candidateCount: number;
  includedCandidateCount: number;
  excludedCandidateCount: number;
  exclusionReasonsSummary: Record<string, number>;
  topCandidates: Array<DiscoveryCandidate & { score: number; reasons: string[] }>;
  excludedCandidates: AheadDiscoveryExcludedCandidate[];
}

export interface NarrativePlanInput {
  poiId: string;
  placeName: string;
  mode: DiscoveryMode;
  guideId: string;
  themeTags: string[];
  storySeed?: string;
  targetDurationSec: number;
}

export interface NarrativePlan extends NarrativePlanInput {
  safety: {
    vehicleSafe: boolean;
    maxDurationSec: number;
    visualLoad: 'minimal' | 'normal';
  };
  structure: Array<'hook' | 'context' | 'fact' | 'closing'>;
}

export type DiscoveryDecision =
  | {
      type: 'trigger_story';
      poiId: string;
      triggerReason: TriggerReason;
      etaSeconds?: number;
      distanceMeters: number;
      mode: DiscoveryMode;
      narrativePlanInput: NarrativePlanInput;
    }
  | {
      type: 'hold';
      reason: HoldReason;
    };

export interface DrivePoi {
  place_id: string;
  name: string;
  geometry: { location: { lat: number; lng: number } };
}

export interface DrivePingResult {
  nextAction: 'PLAY' | 'NONE';
  poi?: DrivePoi;
  audioUrl?: string;
  textPreview?: string;
  decision?: DiscoveryDecision;
  narrativePlan?: NarrativePlan;
  transcriptText?: string;
  estimatedDurationSec?: number;
  circuitLimited?: boolean;
  aheadDiscovery?: AheadDiscoveryDiagnostic;
}

export interface StoryFinishResult {
  ok: boolean;
  activeStoryWasPlaying: boolean;
  reason: StoryFinishReason;
}
