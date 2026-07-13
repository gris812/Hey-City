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
}

export interface StoryFinishResult {
  ok: boolean;
  activeStoryWasPlaying: boolean;
  reason: StoryFinishReason;
}
