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
  /** Display-only nearby list; does not override deterministic story direction checks. */
  nearbyCandidates?: DiscoveryCandidate[];
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

export type NarrativeLevel = 'auto' | 'short' | 'long';
export type MomentRelationship = 'new_topic' | 'continuation' | 'callback' | 'contrast' | 'transition' | 'orientation';
export type NarrativeIntent = 'notice' | 'orient' | 'surprise' | 'explain' | 'connect' | 'reflect';
export type NarrativeDelivery = 'micro' | 'observation' | 'brief_story' | 'deep_story';
export type NarrativeBeatKind = 'attention' | 'hook' | 'reveal' | 'context' | 'human' | 'contrast' | 'callback' | 'transition' | 'stop';
export interface MomentPlan {
  relationship: MomentRelationship;
  intent: NarrativeIntent;
  delivery: NarrativeDelivery;
  /** Validated earlier moment/entity references; never a raw transcript. */
  priorContextRefs?: string[];
  attentionCue?: { relativeDirection?: 'ahead' | 'left' | 'right' };
}
export interface NarrativeBeat { kind: NarrativeBeatKind; objective: string }
export interface StoryAvailability { short: boolean; long: boolean }

export interface NarrativePlan extends NarrativePlanInput {
  level: NarrativeLevel;
  moment: MomentPlan;
  narrativeAngle: string;
  beats: NarrativeBeat[];
  mustAvoid: string[];
  evidenceRefs: string[];
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

/** Display-only source credit. Raw evidence and claim text remain server-internal. */
export interface NarrativeAttribution {
  label: string;
  url?: string;
}

export interface DrivePingResult {
  nextAction: 'PLAY' | 'NONE';
  /** Opaque playback identity required by the finish endpoint. */
  momentId?: string;
  mode?: DiscoveryMode;
  speedKmh?: number;
  poi?: DrivePoi;
  audioUrl?: string;
  textPreview?: string;
  decision?: DiscoveryDecision;
  narrativePlan?: NarrativePlan;
  transcriptText?: string;
  estimatedDurationSec?: number;
  attribution?: NarrativeAttribution;
  circuitLimited?: boolean;
  aheadDiscovery?: AheadDiscoveryDiagnostic;
}

export interface StoryFinishResult {
  ok: boolean;
  stale?: boolean;
  activeStoryWasPlaying: boolean;
  reason: StoryFinishReason;
}

/** M3 text conversation is session-scoped; it is not a separate chatbot mode. */
export type ConversationIntent =
  | 'ask_about_current_story'
  | 'ask_about_visible_object'
  | 'ask_about_area'
  | 'nearby_search'
  | 'recommendation_request'
  | 'navigation_request'
  | 'go_deeper'
  | 'repeat'
  | 'stop_story'
  | 'resume_story'
  | 'change_topic'
  | 'general_contextual_question';

export type ConversationToolName =
  | 'NearbySearch'
  | 'PlaceDetails'
  | 'CurrentTarget'
  | 'CurrentArea'
  | 'JourneyRecall'
  | 'StoryEvidence'
  | 'MapHighlight'
  | 'NavigationHandoff';

export interface ConversationToolResult {
  tool: ConversationToolName;
  success: boolean;
  resultCount?: number;
}

export interface ConversationNearbyResult {
  id: string;
  name: string;
  category?: string;
  latitude: number;
  longitude: number;
  distanceMeters?: number;
  address?: string;
}

export type ResumeDirective =
  | { action: 'resume_existing'; momentId: string }
  | { action: 'abandon_previous'; momentId?: string }
  | { action: 'stay_idle' };

export interface MapAction {
  type: 'highlight_places';
  places: Array<{ id: string; label: string; latitude: number; longitude: number }>;
}

export interface NavigationAction {
  type: 'navigation_handoff';
  destination: { id?: string; name: string; latitude: number; longitude: number };
}

export interface ConversationTurnResult {
  turnId: string;
  intent: ConversationIntent;
  answerText: string;
  audioUrl?: string;
  toolResults?: ConversationToolResult[];
  mapActions?: MapAction[];
  navigationAction?: NavigationAction;
  resume: ResumeDirective;
}

export interface ConversationInterruptRequest {
  momentId: string;
  listenedSeconds?: number;
}

export interface ConversationInterruptResult {
  ok: boolean;
  stale?: boolean;
  momentId?: string;
  state: 'listening' | 'idle';
}

export interface ConversationTurnRequest {
  text: string;
  clientTurnId?: string;
  selectedResultId?: string;
}

export interface ConversationResumeRequest { momentId: string }
export interface ConversationCancelRequest { turnId?: string }

export interface ConversationControlResult {
  ok: boolean;
  stale?: boolean;
  resume?: ResumeDirective;
}

/** M4 realtime voice is an optional transport over the existing M3 conversation path. */
export type RealtimeTransportKind = 'webrtc' | 'websocket' | 'native';

export type RealtimeVoiceState =
  | 'closed'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'idle_window';

/**
 * Short-lived connection material for one realtime session. Permanent provider
 * credentials are never part of this contract. Provider adapters interpret the
 * fields that apply to their transport.
 */
export interface RealtimeClientConnection {
  providerId: string;
  providerSessionId: string;
  model: string;
  transport: RealtimeTransportKind;
  expiresAt: string;
  connection:
    | { kind: 'webrtc_answer'; answerSdp: string }
    | { kind: 'websocket_ephemeral'; url: string; token: string }
    | { kind: 'deterministic' };
}

export interface RealtimeVoiceConnectRequest {
  transport: RealtimeTransportKind;
  clientSdp?: string;
  /** Development-only field benchmark override; rejected unless explicitly enabled server-side. */
  benchmarkProvider?: 'openai' | 'gemini';
}

export interface RealtimeVoiceConnectResult {
  sessionId: string;
  providerId: string;
  generation: number;
  state: RealtimeVoiceState;
  connection: RealtimeClientConnection;
}

/** Partial turns remain transport-local; only final turns may enter M3. */
export interface RealtimeUserTurn {
  voiceTurnId: string;
  text: string;
  isFinal: boolean;
  startedAt: string;
  endedAt?: string;
  providerId: string;
  providerConfidence?: number;
}

/** Provider-neutral server authority; transport adapters translate to vendor events. */
export type RealtimeClientCommand =
  | {
      type: 'speak_grounded_answer';
      voiceTurnId: string;
      text: string;
      renderingInstructions: string;
    }
  | { type: 'cancel_response' }
  | { type: 'close'; reason: string };

export type RealtimeVoiceTurnResult =
  | { accepted: false; generation: number; state: RealtimeVoiceState }
  | {
      accepted: true;
      generation: number;
      state: RealtimeVoiceState;
      result: ConversationTurnResult;
      commands: RealtimeClientCommand[];
      /** Existing SpeechProvider fallback; it does not create a second M3 turn. */
      fallbackAudioUrl?: string;
    };

export interface RealtimeVoiceControlResult {
  ok: boolean;
  generation: number;
  state: RealtimeVoiceState;
  commands?: RealtimeClientCommand[];
}

export interface RealtimeVoiceFallbackResult {
  generation: number;
  state: RealtimeVoiceState;
  audioUrl: string;
}

/** Aggregate counters only; raw audio, transcript, answers, events and GPS are forbidden. */
export interface RealtimeVoiceUsageReport {
  providerId: string;
  generation: number;
  voiceTurnId?: string;
  firstAudioLatencyMs?: number;
  inputTextTokens?: number;
  outputTextTokens?: number;
  inputAudioTokens?: number;
  outputAudioTokens?: number;
  inputAudioBytes?: number;
  outputAudioBytes?: number;
  estimatedCostUsd?: number;
}
