import type {
  ConversationTurnResult,
  RealtimeClientCommand,
  RealtimeClientConnection,
  RealtimeTransportKind,
  RealtimeUserTurn,
  RealtimeVoiceConnectResult,
  RealtimeVoiceState,
  RealtimeVoiceTurnResult,
  RealtimeVoiceUsageReport,
} from '@heycity/shared';

export type RealtimeClientEvent =
  | { type: 'state'; state: RealtimeVoiceState }
  | { type: 'speech_started' }
  | { type: 'speech_ended' }
  | { type: 'user_turn'; turn: RealtimeUserTurn }
  | { type: 'response_started'; generation: number; voiceTurnId: string }
  | { type: 'response_audio_started'; generation: number; voiceTurnId: string }
  | { type: 'output_transcript'; generation: number; voiceTurnId: string; text: string; isFinal: boolean }
  | { type: 'response_completed'; generation: number; voiceTurnId: string; usage?: Omit<RealtimeVoiceUsageReport, 'generation'> }
  | { type: 'closed' }
  | { type: 'error'; code: string };

export type Unsubscribe = () => void;

/** UI-facing transport boundary. Vendor SDK/event payloads stay inside adapters. */
export interface RealtimeVoiceTransport {
  readonly kind: RealtimeTransportKind;
  configureSession?(input: { providerId: string; generation: number }): void;
  createClientOffer?(): Promise<string>;
  connect(connection: RealtimeClientConnection): Promise<void>;
  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  interruptOutput(): Promise<void>;
  applyCommands(commands: RealtimeClientCommand[]): Promise<void>;
  close(): Promise<void>;
  onEvent(handler: (event: RealtimeClientEvent) => void): Unsubscribe;
}

export type RealtimeVoiceClientState = RealtimeVoiceState | 'permission_error' | 'error';

export type RealtimeVoiceBenchmarkEventName =
  | 'talk_tap'
  | 'local_story_paused'
  | 'realtime_connect_start'
  | 'realtime_ready'
  | 'speech_start'
  | 'speech_end'
  | 'final_turn_received'
  | 'm3_turn_start'
  | 'm3_answer_ready'
  | 'provider_response_requested'
  | 'first_audio'
  | 'provider_output_transcript'
  | 'response_complete'
  | 'barge_in_detected'
  | 'old_output_stopped'
  | 'session_close'
  | 'reconnect_ready';

/** Benchmark-only observer. Callers must not forward transcript fields to usage_events. */
export interface RealtimeVoiceBenchmarkEvent {
  name: RealtimeVoiceBenchmarkEventName;
  atMonotonicMs: number;
  generation: number;
  voiceTurnId?: string;
  text?: string;
  providerId?: string;
  model?: string;
  usage?: Omit<RealtimeVoiceUsageReport, 'generation'>;
}

export interface RealtimeVoiceClientDependencies {
  sessionId: string;
  transport: RealtimeVoiceTransport;
  benchmarkProvider?: 'openai' | 'gemini';
  /** Pauses locally, then performs the single M3 interrupt registration. */
  interruptInitialStory(): Promise<boolean>;
  connect(input: { transport: RealtimeTransportKind; clientSdp?: string; benchmarkProvider?: 'openai' | 'gemini' }): Promise<RealtimeVoiceConnectResult>;
  submitTurn(turn: RealtimeUserTurn): Promise<RealtimeVoiceTurnResult>;
  bargeIn(): Promise<{ generation: number; state: RealtimeVoiceState; commands?: RealtimeClientCommand[] }>;
  closeRemote(): Promise<unknown>;
  reportUsage?(report: RealtimeVoiceUsageReport): Promise<unknown>;
  requestFallback?(input: { generation: number; voiceTurnId: string }): Promise<{ audioUrl: string }>;
  onGroundedResult(result: ConversationTurnResult): void;
  onAnswerComplete(result: ConversationTurnResult): Promise<void> | void;
  playFallbackAudio?(audioUrl: string): Promise<void>;
  onStateChange?(state: RealtimeVoiceClientState): void;
  onClosed?(): Promise<void> | void;
  onBenchmarkEvent?(event: RealtimeVoiceBenchmarkEvent): void;
  now?: () => number;
  inactivityTimeoutMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

/**
 * One client lifecycle per DriveSession. It owns transport state only; M3 owns
 * intent, tools, grounding, memory and resume/abandon decisions.
 */
export class RealtimeVoiceClientSession {
  private readonly deps: RealtimeVoiceClientDependencies;
  private state: RealtimeVoiceClientState = 'closed';
  private generation = 0;
  private providerId?: string;
  private activation?: Promise<boolean>;
  private storyInterrupted = false;
  private unsubscribe?: Unsubscribe;
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  private pending?: { generation: number; voiceTurnId: string; result: ConversationTurnResult };
  private disposed = false;
  private activationAttempts = 0;

  constructor(deps: RealtimeVoiceClientDependencies) {
    this.deps = deps;
  }

  getState(): RealtimeVoiceClientState {
    return this.state;
  }

  /** Zero idle cost: construction performs no provider/network work. */
  activate(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.activation) return this.activation;
    if (this.state !== 'closed') return Promise.resolve(true);
    this.observe('talk_tap');
    this.activationAttempts += 1;
    this.activation = this.open().finally(() => { this.activation = undefined; });
    return this.activation;
  }

  private async open(): Promise<boolean> {
    this.setState('connecting');
    try {
      if (!this.storyInterrupted) {
        const interrupted = await this.deps.interruptInitialStory();
        if (!interrupted) {
          throw new Error('story_interruption_failed');
        }
        this.storyInterrupted = true;
        this.observe('local_story_paused');
      }

      const clientSdp = await this.deps.transport.createClientOffer?.();
      this.observe('realtime_connect_start');
      const bootstrap = await this.deps.connect({
        transport: this.deps.transport.kind,
        ...(clientSdp ? { clientSdp } : {}),
        ...(this.deps.benchmarkProvider ? { benchmarkProvider: this.deps.benchmarkProvider } : {}),
      });
      if (bootstrap.sessionId !== this.deps.sessionId || Date.parse(bootstrap.connection.expiresAt) <= Date.now()) {
        throw new Error('invalid_realtime_connection');
      }
      this.generation = bootstrap.generation;
      this.providerId = bootstrap.providerId;
      this.deps.transport.configureSession?.({
        providerId: bootstrap.providerId,
        generation: bootstrap.generation,
      });
      this.unsubscribe?.();
      this.unsubscribe = this.deps.transport.onEvent((event) => { void this.handleEvent(event); });
      await this.deps.transport.connect(bootstrap.connection);
      this.observe('realtime_ready', { model: bootstrap.connection.model });
      if (this.activationAttempts > 1) this.observe('reconnect_ready');
      await this.deps.transport.startCapture();
      this.setState('listening');
      this.resetInactivityTimer();
      return true;
    } catch (error) {
      this.setState(isPermissionError(error) ? 'permission_error' : 'error');
      await this.failClosedActivation();
      return false;
    }
  }

  /**
   * A failed activation is a completed, closed attempt. Invalidate callbacks
   * before asynchronous cleanup, then resume the exact suspended M3 moment.
   */
  private async failClosedActivation(): Promise<void> {
    const shouldResumeStory = this.storyInterrupted;
    this.storyInterrupted = false;
    this.providerId = undefined;
    this.invalidate();
    this.setState('closed');
    this.observe('session_close');
    await this.deps.transport.stopCapture().catch(() => {});
    await Promise.allSettled([this.deps.transport.close(), this.deps.closeRemote()]);
    if (shouldResumeStory) await this.deps.onClosed?.();
  }

  private async handleEvent(event: RealtimeClientEvent): Promise<void> {
    if (this.disposed || this.state === 'closed') return;
    this.resetInactivityTimer();
    if (event.type === 'state') {
      this.setState(event.state);
      return;
    }
    if (event.type === 'speech_started') {
      this.observe('speech_start');
      if (this.state === 'speaking' || this.state === 'processing') await this.interruptForBargeIn();
      else if (this.state === 'idle_window' && !this.storyInterrupted) {
        const interrupted = await this.deps.interruptInitialStory().catch(() => false);
        if (!interrupted) {
          this.setState('error');
          return;
        }
        this.storyInterrupted = true;
      }
      this.setState('listening');
      return;
    }
    if (event.type === 'speech_ended') {
      this.observe('speech_end');
      return;
    }
    if (event.type === 'user_turn') {
      if (!event.turn.isFinal) return;
      this.observe('final_turn_received', { voiceTurnId: event.turn.voiceTurnId, text: event.turn.text });
      await this.forwardFinalTurn(event.turn);
      return;
    }
    if (event.type === 'response_started') {
      if (event.generation !== this.generation) return;
      this.setState('speaking');
      return;
    }
    if (event.type === 'response_audio_started') {
      if (event.generation === this.generation) {
        this.observe('first_audio', { voiceTurnId: event.voiceTurnId });
      }
      return;
    }
    if (event.type === 'output_transcript') {
      if (event.generation === this.generation) {
        this.observe('provider_output_transcript', { voiceTurnId: event.voiceTurnId, text: event.text });
      }
      return;
    }
    if (event.type === 'response_completed') {
      const pending = this.pending;
      if (!pending || event.generation !== this.generation || pending.generation !== this.generation || pending.voiceTurnId !== event.voiceTurnId) return;
      this.pending = undefined;
      this.observe('response_complete', { voiceTurnId: event.voiceTurnId, usage: event.usage });
      if (event.usage && this.deps.reportUsage) {
        await this.deps.reportUsage({ ...event.usage, generation: event.generation }).catch(() => {});
      }
      await this.deps.onAnswerComplete(pending.result);
      this.storyInterrupted = pending.result.resume.action !== 'resume_existing';
      this.setState('idle_window');
      return;
    }
    if (event.type === 'closed') {
      this.invalidate();
      this.setState('closed');
      return;
    }
    if (event.type === 'error') this.setState('error');
  }

  private async forwardFinalTurn(turn: RealtimeUserTurn): Promise<void> {
    const expectedGeneration = this.generation;
    this.setState('processing');
    this.observe('m3_turn_start', { voiceTurnId: turn.voiceTurnId });
    const response = await this.deps.submitTurn(turn).catch(() => null);
    if (!response?.accepted || this.disposed || expectedGeneration !== this.generation) return;
    this.generation = response.generation;
    this.deps.transport.configureSession?.({
      providerId: turn.providerId,
      generation: response.generation,
    });
    this.deps.onGroundedResult(response.result);
    this.observe('m3_answer_ready', { voiceTurnId: turn.voiceTurnId, text: response.result.answerText });
    this.pending = { generation: response.generation, voiceTurnId: turn.voiceTurnId, result: response.result };
    let fallbackAudioUrl = response.fallbackAudioUrl;
    try {
      this.observe('provider_response_requested', { voiceTurnId: turn.voiceTurnId });
      await this.deps.transport.applyCommands(response.commands);
    } catch {
      fallbackAudioUrl = (await this.deps.requestFallback?.({
        generation: response.generation,
        voiceTurnId: turn.voiceTurnId,
      }).catch(() => undefined))?.audioUrl;
    }
    if (fallbackAudioUrl && this.deps.playFallbackAudio) {
      const fallbackGeneration = response.generation;
      await this.deps.playFallbackAudio(fallbackAudioUrl).catch(() => {});
      if (this.pending?.generation !== fallbackGeneration || fallbackGeneration !== this.generation) return;
      const pending = this.pending;
      this.pending = undefined;
      await this.deps.onAnswerComplete(pending.result);
      this.storyInterrupted = pending.result.resume.action !== 'resume_existing';
      this.setState('idle_window');
    }
  }

  async interruptForBargeIn(): Promise<void> {
    if (this.disposed || this.state === 'closed') return;
    // Invalidate local output before awaiting the server cancellation.
    this.generation += 1;
    this.pending = undefined;
    this.observe('barge_in_detected');
    await this.deps.transport.interruptOutput().catch(() => {});
    this.observe('old_output_stopped');
    const result = await this.deps.bargeIn().catch(() => null);
    if (result) {
      this.generation = Math.max(this.generation, result.generation);
      this.deps.transport.configureSession?.({
        providerId: this.providerId ?? 'unknown',
        generation: this.generation,
      });
      if (result.commands?.length) await this.deps.transport.applyCommands(result.commands).catch(() => {});
    }
    this.setState('listening');
  }

  async close(): Promise<void> {
    if (this.state === 'closed' && !this.activation) return;
    const shouldResumeStory = this.storyInterrupted;
    this.storyInterrupted = false;
    this.providerId = undefined;
    this.invalidate();
    // Invalidate synchronously so late provider events cannot publish while
    // native/network cleanup is still awaiting completion.
    this.setState('closed');
    this.observe('session_close');
    await this.deps.transport.stopCapture().catch(() => {});
    await Promise.allSettled([this.deps.transport.close(), this.deps.closeRemote()]);
    if (shouldResumeStory) await this.deps.onClosed?.();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.close();
  }

  private invalidate(): void {
    this.generation += 1;
    this.pending = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.clearInactivityTimer();
  }

  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    const timeoutMs = this.deps.inactivityTimeoutMs;
    if (!timeoutMs || timeoutMs <= 0) return;
    const setTimer = this.deps.setTimer ?? setTimeout;
    this.inactivityTimer = setTimer(() => { void this.close(); }, timeoutMs);
  }

  private clearInactivityTimer(): void {
    if (!this.inactivityTimer) return;
    (this.deps.clearTimer ?? clearTimeout)(this.inactivityTimer);
    this.inactivityTimer = undefined;
  }

  private setState(state: RealtimeVoiceClientState): void {
    this.state = state;
    this.deps.onStateChange?.(state);
  }

  private observe(
    name: RealtimeVoiceBenchmarkEventName,
    detail: Pick<RealtimeVoiceBenchmarkEvent, 'voiceTurnId' | 'text' | 'model' | 'usage'> = {},
  ): void {
    this.deps.onBenchmarkEvent?.({
      name,
      atMonotonicMs: (this.deps.now ?? defaultMonotonicNow)(),
      generation: this.generation,
      ...(detail.voiceTurnId ? { voiceTurnId: detail.voiceTurnId } : {}),
      ...(detail.text !== undefined ? { text: detail.text } : {}),
      ...(detail.model ? { model: detail.model } : {}),
      ...(detail.usage ? { usage: detail.usage } : {}),
      ...(this.providerId ? { providerId: this.providerId } : {}),
    });
  }
}

function defaultMonotonicNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function isPermissionError(error: unknown): boolean {
  return error instanceof Error && /permission|microphone|notallowed/i.test(error.message);
}
