import type {
  GroundedRenderingSupport,
  RealtimeAnswerInput,
  RealtimeClientCommand,
  RealtimeCloseReason,
  RealtimeProviderEvent,
  RealtimeProviderSession,
} from './contracts';

export abstract class ProviderSessionBase implements RealtimeProviderSession {
  abstract readonly providerSessionId: string;
  abstract readonly model: string;
  abstract readonly groundedRenderingSupport: GroundedRenderingSupport;
  protected closed = false;
  private readonly handlers = new Set<(event: RealtimeProviderEvent) => void>();
  private commands: RealtimeClientCommand[] = [];

  abstract issueClientConnection(request?: { clientSdp?: string }): Promise<import('./contracts').RealtimeClientConnection>;

  async submitAnswer(input: RealtimeAnswerInput): Promise<void> {
    this.assertOpen();
    const text = input.text.trim();
    if (!text || text.length > 4_000) throw new Error('Grounded realtime answer must contain 1..4000 characters');
    this.commands.push({
      type: 'speak_grounded_answer',
      voiceTurnId: boundedId(input.voiceTurnId),
      text,
      renderingInstructions: (input.renderingInstructions ?? 'Speak the supplied text exactly. Do not add, remove, or change facts.').slice(0, 500),
    });
  }

  async cancelResponse(): Promise<void> {
    this.assertOpen();
    this.commands.push({ type: 'cancel_response' });
  }

  async close(reason: RealtimeCloseReason): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.commands.push({ type: 'close', reason });
    this.emit({ type: 'closed', reason, at: new Date().toISOString() });
    this.handlers.clear();
  }

  onEvent(handler: (event: RealtimeProviderEvent) => void): () => void {
    if (this.closed) return () => {};
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  takeClientCommands(): RealtimeClientCommand[] {
    const commands = this.commands;
    this.commands = [];
    return commands;
  }

  protected emit(event: RealtimeProviderEvent): void {
    if (this.closed && event.type !== 'closed') return;
    for (const handler of this.handlers) handler(event);
  }

  protected assertOpen(): void {
    if (this.closed) throw new Error('Realtime provider session is closed');
  }
}

function boundedId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(value)) throw new Error('Invalid voice turn id');
  return value;
}

