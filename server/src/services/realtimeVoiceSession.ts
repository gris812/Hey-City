import { realtimeVoice } from '../config';
import type {
  RealtimeClientConnection,
  RealtimeClientCommand,
  RealtimeCloseReason,
  RealtimeConversationProvider,
  RealtimeProviderEvent,
  RealtimeProviderSession,
  RealtimeSessionConfig,
  RealtimeUserTurn,
  RealtimeUsage,
} from '../voice/contracts';
import type { ConversationSessionContext } from './conversationService';
import { RealtimeConversationBridge, type RealtimeBridgeResult } from './realtimeConversationBridge';
import { recordRealtimeEvent, recordRealtimeUsage } from './usage';

export type RealtimeVoiceState =
  | 'closed'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'idle_window';

export interface RealtimeVoiceConnectionResult {
  sessionId: string;
  providerId: string;
  generation: number;
  state: RealtimeVoiceState;
  connection: RealtimeClientConnection;
}

export interface RealtimeVoiceTurnResult extends RealtimeBridgeResult {
  accepted: true;
  generation: number;
  state: RealtimeVoiceState;
  commands: RealtimeClientCommand[];
}

export interface RealtimeVoiceIgnoredTurnResult {
  accepted: false;
  generation: number;
  state: RealtimeVoiceState;
}

interface ProviderRouter {
  resolve(providerId?: string): RealtimeConversationProvider;
}

export interface RealtimeVoiceSessionDependencies {
  providerRouter: ProviderRouter;
  bridge: RealtimeConversationBridge;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

export class RealtimeVoiceTurnSupersededError extends Error {
  readonly status = 409;
  constructor() { super('Realtime voice turn superseded'); }
}

/** One lazily-created realtime provider session owned by one DriveSession. */
export class RealtimeVoiceSession {
  private static readonly activeOwners = new Set<string>();
  private state: RealtimeVoiceState = 'closed';
  private generation = 0;
  private providerId?: string;
  private providerSession?: RealtimeProviderSession;
  private unsubscribe?: () => void;
  private connecting?: Promise<RealtimeVoiceConnectionResult>;
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  private maximumTimer?: ReturnType<typeof setTimeout>;
  private activeVoiceTurnId?: string;
  private groundedAnswer?: { generation: number; voiceTurnId: string; text: string };
  private ownsConcurrencySlot = false;
  private transport?: RealtimeSessionConfig['clientTransport'];
  private turnCount = 0;
  private readonly seenTurns = new Set<string>();
  private readonly schedule: typeof setTimeout;
  private readonly unschedule: typeof clearTimeout;

  constructor(
    private readonly session: ConversationSessionContext,
    private readonly dependencies: RealtimeVoiceSessionDependencies,
  ) {
    this.schedule = dependencies.setTimer ?? setTimeout;
    this.unschedule = dependencies.clearTimer ?? clearTimeout;
  }

  snapshot(): Readonly<{ state: RealtimeVoiceState; generation: number; providerId?: string; activeVoiceTurnId?: string }> {
    return Object.freeze({
      state: this.state,
      generation: this.generation,
      providerId: this.providerId,
      activeVoiceTurnId: this.activeVoiceTurnId,
    });
  }

  static activeSessionCountForTests(): number {
    return this.activeOwners.size;
  }

  async connect(input: {
    transport: RealtimeSessionConfig['clientTransport'];
    clientSdp?: string;
    providerId?: 'openai' | 'gemini';
  }): Promise<RealtimeVoiceConnectionResult> {
    if (this.connecting) return this.connecting;
    this.connecting = this.connectInternal(input).finally(() => { this.connecting = undefined; });
    return this.connecting;
  }

  async submitUserTurn(turn: RealtimeUserTurn): Promise<RealtimeVoiceTurnResult | RealtimeVoiceIgnoredTurnResult> {
    if (!turn.isFinal) return { accepted: false, generation: this.generation, state: this.state };
    const text = typeof turn.text === 'string' ? turn.text.trim().slice(0, 1000) : '';
    if (!text) return { accepted: false, generation: this.generation, state: this.state };
    if (!this.providerSession || this.state === 'closed') throw new Error('Realtime voice session is not connected');
    if (this.providerId && turn.providerId !== this.providerId) throw new Error('Realtime provider mismatch');
    if (this.seenTurns.has(turn.voiceTurnId)) return { accepted: false, generation: this.generation, state: this.state };
    this.rememberTurn(turn.voiceTurnId);

    this.clearInactivityTimer();
    const mustCancelOutput = this.state === 'processing' || this.state === 'speaking';
    const turnGeneration = ++this.generation;
    this.activeVoiceTurnId = turn.voiceTurnId;
    this.turnCount += 1;
    this.state = 'processing';
    this.record('realtime_user_turn_final', { success: true });
    // Invoke cancellation immediately; M3 beginTurn remains the authoritative
    // latest-wins cancellation when the normalized turn enters the bridge.
    if (mustCancelOutput) void this.providerSession.cancelResponse().catch(() => undefined);
    const assertCurrent = (): void => {
      if (this.generation !== turnGeneration || this.activeVoiceTurnId !== turn.voiceTurnId || this.isClosed()) {
        throw new RealtimeVoiceTurnSupersededError();
      }
    };

    try {
      const bridged = await this.dependencies.bridge.handleFinalTurn(
        this.session,
        this.providerSession,
        { ...turn, text },
        voiceRenderingInstructions(this.session.params.voiceId, this.session.params.language),
        assertCurrent,
      );
      assertCurrent();
      this.state = bridged.fallbackAudioUrl ? 'idle_window' : 'speaking';
      this.groundedAnswer = { generation: turnGeneration, voiceTurnId: turn.voiceTurnId, text: bridged.result.answerText };
      this.armInactivityTimer();
      return {
        accepted: true,
        generation: turnGeneration,
        state: this.state,
        ...bridged,
        commands: this.providerSession.takeClientCommands(),
      };
    } catch (error) {
      if (this.generation === turnGeneration && !this.isClosed()) {
        this.state = 'idle_window';
        this.armInactivityTimer();
      }
      throw error;
    }
  }

  async bargeIn(): Promise<{
    ok: boolean;
    generation: number;
    state: RealtimeVoiceState;
    commands?: RealtimeClientCommand[];
  }> {
    if (!this.providerSession || this.state === 'closed') return { ok: false, generation: this.generation, state: this.state };
    ++this.generation;
    this.activeVoiceTurnId = undefined;
    this.groundedAnswer = undefined;
    this.dependencies.bridge.cancel(this.session);
    this.state = 'listening';
    this.record('realtime_barge_in', { success: true });
    this.clearInactivityTimer();
    await this.providerSession.cancelResponse().catch(() => undefined);
    this.armInactivityTimer();
    return {
      ok: true,
      generation: this.generation,
      state: this.state,
      commands: this.providerSession.takeClientCommands(),
    };
  }

  async close(reason: RealtimeCloseReason): Promise<void> {
    if (this.state === 'closed' && !this.providerSession && !this.connecting) return;
    ++this.generation;
    this.state = 'closed';
    this.activeVoiceTurnId = undefined;
    this.groundedAnswer = undefined;
    this.dependencies.bridge.cancel(this.session);
    this.clearTimers();
    const provider = this.providerSession;
    this.record('realtime_session_closed', { closeReason: reason, success: true });
    this.providerSession = undefined;
    this.providerId = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.releaseConcurrencySlot();
    if (provider) await provider.close(reason).catch(() => undefined);
  }

  async reportUsage(input: {
    providerId: string;
    generation: number;
    voiceTurnId?: string;
    firstAudioLatencyMs?: number;
    usage: RealtimeUsage;
  }): Promise<boolean> {
    if (!this.providerSession || this.isClosed() || input.providerId !== this.providerId ||
        input.generation !== this.generation ||
        (input.voiceTurnId && input.voiceTurnId !== this.activeVoiceTurnId)) return false;
    if ((input.usage.inputAudioBytes ?? 0) > realtimeVoice.maxInputAudioBytes ||
        (input.usage.outputAudioBytes ?? 0) > realtimeVoice.maxOutputAudioBytes) return false;
    if (Number.isFinite(input.firstAudioLatencyMs)) {
      await recordRealtimeEvent('realtime_response_first_audio', this.event({
        latencyMs: input.firstAudioLatencyMs,
        success: true,
      }), this.session.userId);
    }
    await recordRealtimeUsage(providerForUsage(this.providerId), this.providerSession.model, input.usage, this.session.userId);
    this.groundedAnswer = undefined;
    return true;
  }

  async renderFallback(input: { generation: number; voiceTurnId: string }): Promise<{ generation: number; state: RealtimeVoiceState; audioUrl: string }> {
    const grounded = this.groundedAnswer;
    if (!grounded || this.isClosed() || input.generation !== this.generation ||
        grounded.generation !== input.generation || grounded.voiceTurnId !== input.voiceTurnId) {
      throw new RealtimeVoiceTurnSupersededError();
    }
    this.record('realtime_provider_error', { errorCode: 'realtime_output_failed', success: false });
    const audioUrl = await this.dependencies.bridge.renderGroundedFallback(this.session, grounded.text);
    if (!this.groundedAnswer || this.generation !== input.generation) throw new RealtimeVoiceTurnSupersededError();
    this.state = 'idle_window';
    this.armInactivityTimer();
    return { generation: this.generation, state: this.state, audioUrl };
  }

  private async connectInternal(input: {
    transport: RealtimeSessionConfig['clientTransport'];
    clientSdp?: string;
    providerId?: 'openai' | 'gemini';
  }): Promise<RealtimeVoiceConnectionResult> {
    const connectionGeneration = ++this.generation;
    if (this.providerSession && this.state !== 'closed') {
      throw new Error('Realtime voice session is already connected');
    }

    this.state = 'connecting';
    this.transport = input.transport;
    this.acquireConcurrencySlot();
    const provider = this.dependencies.providerRouter.resolve(input.providerId);
    const startedAt = Date.now();
    let providerSession: RealtimeProviderSession | undefined;
    try {
      providerSession = await provider.createSession({
        sessionId: this.session.id,
        guideId: this.session.params.voiceId,
        language: this.session.params.language,
        voiceProfile: voiceProfile(this.session.params.voiceId, this.session.params.language),
        inactivityTimeoutMs: realtimeVoice.inactivityTimeoutMs,
        clientTransport: input.transport,
      });
      if (this.generation !== connectionGeneration || this.isClosed()) {
        await providerSession.close('superseded');
        throw new RealtimeVoiceTurnSupersededError();
      }
      this.providerSession = providerSession;
      this.providerId = provider.id;
      this.record('realtime_session_started', { success: true });
      this.unsubscribe = providerSession.onEvent(event => this.handleProviderEvent(event, connectionGeneration));
      const connection = await providerSession.issueClientConnection({ clientSdp: input.clientSdp });
      if (this.generation !== connectionGeneration || this.isClosed()) {
        await providerSession.close('superseded');
        throw new RealtimeVoiceTurnSupersededError();
      }
      this.providerId = connection.providerId;
      this.state = 'ready';
      this.armTimers();
      this.record('realtime_session_ready', { latencyMs: Date.now() - startedAt, success: true });
      return this.connectionResult(connection);
    } catch (error) {
      if (providerSession) await providerSession.close('provider_error').catch(() => undefined);
      if (this.generation === connectionGeneration) {
        this.state = 'closed';
        this.providerSession = undefined;
        this.providerId = undefined;
      }
      this.releaseConcurrencySlot();
      this.record('realtime_provider_error', { errorCode: 'connection_failed', success: false });
      throw error;
    }
  }

  private handleProviderEvent(event: RealtimeProviderEvent, connectionGeneration: number): void {
    if (this.state === 'closed' || connectionGeneration > this.generation) return;
    if (event.type === 'ready') {
      if (this.state === 'connecting') this.state = 'ready';
      return;
    }
    if (event.type === 'user_turn') {
      if (event.turn.isFinal) void this.submitUserTurn(event.turn).catch(() => undefined);
      return;
    }
    if (event.type === 'response_first_audio' && event.voiceTurnId === this.activeVoiceTurnId) {
      this.state = 'speaking';
      this.record('realtime_response_first_audio', { success: true });
      return;
    }
    if (event.type === 'response_complete' && event.voiceTurnId === this.activeVoiceTurnId) {
      this.state = 'idle_window';
      this.groundedAnswer = undefined;
      this.armInactivityTimer();
      if (event.usage && this.providerSession) {
        void recordRealtimeUsage(providerForUsage(this.providerId), this.providerSession.model, event.usage, this.session.userId);
      }
      return;
    }
    if (event.type === 'closed') {
      void this.close(event.reason);
      return;
    }
    if (event.type === 'error') {
      this.record('realtime_provider_error', { errorCode: event.code, success: false });
      if (!event.recoverable) void this.close('provider_error');
    }
  }

  private connectionResult(connection: RealtimeClientConnection): RealtimeVoiceConnectionResult {
    return {
      sessionId: this.session.id,
      providerId: connection.providerId,
      generation: this.generation,
      state: this.state,
      connection,
    };
  }

  private armTimers(): void {
    this.clearTimers();
    this.armInactivityTimer();
    this.maximumTimer = this.schedule(() => { void this.close('maximum_duration'); }, realtimeVoice.maxSessionDurationMs);
    this.maximumTimer.unref?.();
  }

  private armInactivityTimer(): void {
    this.clearInactivityTimer();
    this.inactivityTimer = this.schedule(() => { void this.close('inactivity'); }, realtimeVoice.inactivityTimeoutMs);
    this.inactivityTimer.unref?.();
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) this.unschedule(this.inactivityTimer);
    this.inactivityTimer = undefined;
  }

  private clearTimers(): void {
    this.clearInactivityTimer();
    if (this.maximumTimer) this.unschedule(this.maximumTimer);
    this.maximumTimer = undefined;
  }

  private rememberTurn(id: string): void {
    this.seenTurns.add(id);
    if (this.seenTurns.size > 100) this.seenTurns.delete(this.seenTurns.values().next().value!);
  }

  private acquireConcurrencySlot(): void {
    if (this.ownsConcurrencySlot) return;
    if (RealtimeVoiceSession.activeOwners.size >= realtimeVoice.maxConcurrentSessions) {
      throw new Error('Realtime voice capacity reached');
    }
    RealtimeVoiceSession.activeOwners.add(this.session.id);
    this.ownsConcurrencySlot = true;
  }

  private releaseConcurrencySlot(): void {
    if (!this.ownsConcurrencySlot) return;
    RealtimeVoiceSession.activeOwners.delete(this.session.id);
    this.ownsConcurrencySlot = false;
  }

  private isClosed(): boolean {
    return this.state === 'closed';
  }

  private event(extra: {
    latencyMs?: number;
    closeReason?: string;
    success?: boolean;
    errorCode?: string;
  }) {
    return {
      sessionId: this.session.id,
      provider: this.providerId ?? 'unknown',
      model: this.providerSession?.model,
      transport: this.transport,
      guideId: this.session.params.voiceId,
      language: this.session.params.language,
      turnCount: this.turnCount,
      ...extra,
    };
  }

  private record(operation: Parameters<typeof recordRealtimeEvent>[0], extra: Parameters<RealtimeVoiceSession['event']>[0]): void {
    void recordRealtimeEvent(operation, this.event(extra), this.session.userId).catch(() => undefined);
  }
}

function providerForUsage(providerId: string | undefined): 'openai' | 'gemini' | 'deterministic' {
  return providerId === 'openai' || providerId === 'gemini' ? providerId : 'deterministic';
}

function voiceProfile(guideId: string, language: string): RealtimeSessionConfig['voiceProfile'] {
  return {
    guideId,
    language,
    speakingStyle: guideId.toLowerCase().includes('arthur') || guideId.toLowerCase().includes('artur')
      ? ['measured', 'precise', 'thoughtful', 'quietly engaging']
      : ['warm', 'observant', 'natural', 'conversational'],
    pace: 'normal',
  };
}

function voiceRenderingInstructions(guideId: string, language: string): string {
  const style = voiceProfile(guideId, language);
  return [
    `Speak the approved answer verbatim in ${language}.`,
    `Use the ${guideId} guide identity with a ${style.pace} pace.`,
    `Style: ${style.speakingStyle.join(', ')}. Do not add factual content.`,
  ].join(' ');
}
