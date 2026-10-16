export type RealtimeTransport = 'webrtc' | 'websocket' | 'native';

export interface SpeechSynthesisRequest {
  text: string;
  guideId: string;
  language: string;
  userId?: string;
  signal?: AbortSignal;
}

export interface SpeechSynthesisResult {
  audioUrl?: string;
  audioBytes?: Uint8Array;
  providerId: string;
  model: string;
  latencyMs?: number;
  estimatedCostUsd?: number;
}

export interface SpeechProvider {
  readonly id: string;
  synthesize(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResult>;
}

export interface RealtimeVoiceProfile {
  guideId: string;
  language: string;
  speakingStyle: string[];
  pace?: 'slow' | 'normal' | 'brisk';
  /** A routing hint only. Guide identity must not depend on a vendor voice ID. */
  providerVoiceHint?: string;
}

export interface RealtimeSessionConfig {
  sessionId: string;
  guideId: string;
  language: string;
  voiceProfile: RealtimeVoiceProfile;
  inactivityTimeoutMs: number;
  clientTransport: RealtimeTransport;
}

export interface RealtimeUserTurn {
  voiceTurnId: string;
  text: string;
  isFinal: boolean;
  startedAt: string;
  endedAt?: string;
  providerId: string;
  providerConfidence?: number;
}

export interface RealtimeAnswerInput {
  voiceTurnId: string;
  /** Grounded, approved M3 copy. Providers may render it but must not add facts. */
  text: string;
  renderingInstructions?: string;
}

export type RealtimeCloseReason =
  | 'client_closed'
  | 'drive_session_ended'
  | 'inactivity'
  | 'maximum_duration'
  | 'guide_changed'
  | 'language_changed'
  | 'provider_error'
  | 'superseded';

export interface RealtimeUsage {
  inputTextTokens?: number;
  outputTextTokens?: number;
  inputAudioTokens?: number;
  outputAudioTokens?: number;
  inputAudioBytes?: number;
  outputAudioBytes?: number;
  estimatedCostUsd?: number;
}

export type RealtimeProviderEvent =
  | { type: 'ready'; at: string }
  | { type: 'user_turn'; turn: RealtimeUserTurn }
  | { type: 'response_first_audio'; voiceTurnId: string; at: string }
  | { type: 'response_complete'; voiceTurnId: string; at: string; usage?: RealtimeUsage }
  | { type: 'error'; code: string; recoverable: boolean; at: string }
  | { type: 'closed'; reason: RealtimeCloseReason; at: string };

export interface RealtimeClientConnectionRequest {
  /** Required by OpenAI's server-mediated WebRTC setup. Never contains a provider key. */
  clientSdp?: string;
}

export interface RealtimeClientConnectionBase {
  providerId: string;
  providerSessionId: string;
  model: string;
  transport: RealtimeTransport;
  expiresAt: string;
}

export type RealtimeClientConnection = RealtimeClientConnectionBase & {
  connection:
    | { kind: 'webrtc_answer'; answerSdp: string }
    | { kind: 'websocket_ephemeral'; url: string; token: string }
    | { kind: 'deterministic' };
};

/** Commands are provider-neutral; client transport adapters translate them to vendor events. */
export type RealtimeClientCommand =
  | { type: 'speak_grounded_answer'; voiceTurnId: string; text: string; renderingInstructions: string }
  | { type: 'cancel_response' }
  | { type: 'close'; reason: RealtimeCloseReason };

export type GroundedRenderingSupport = 'inspectable_verbatim' | 'contract_only_benchmark_required';

export interface RealtimeProviderSession {
  readonly providerSessionId: string;
  readonly model: string;
  readonly groundedRenderingSupport: GroundedRenderingSupport;
  issueClientConnection(request?: RealtimeClientConnectionRequest): Promise<RealtimeClientConnection>;
  submitAnswer(input: RealtimeAnswerInput): Promise<void>;
  cancelResponse(): Promise<void>;
  close(reason: RealtimeCloseReason): Promise<void>;
  onEvent(handler: (event: RealtimeProviderEvent) => void): () => void;
  /** Returns and clears transport commands; they are not product telemetry. */
  takeClientCommands(): RealtimeClientCommand[];
}

export interface RealtimeConversationProvider {
  readonly id: string;
  createSession(config: RealtimeSessionConfig): Promise<RealtimeProviderSession>;
}
