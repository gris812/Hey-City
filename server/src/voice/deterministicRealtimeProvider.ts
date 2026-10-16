import { randomUUID } from 'node:crypto';
import type {
  RealtimeClientConnection,
  RealtimeConversationProvider,
  RealtimeProviderEvent,
  RealtimeSessionConfig,
} from './contracts';
import { ProviderSessionBase } from './providerSessionBase';

export class DeterministicRealtimeConversationProvider implements RealtimeConversationProvider {
  readonly id = 'deterministic';
  readonly sessions: DeterministicRealtimeProviderSession[] = [];

  async createSession(config: RealtimeSessionConfig): Promise<DeterministicRealtimeProviderSession> {
    const session = new DeterministicRealtimeProviderSession(config);
    this.sessions.push(session);
    return session;
  }
}

export class DeterministicRealtimeProviderSession extends ProviderSessionBase {
  readonly providerSessionId = `deterministic_${randomUUID()}`;
  readonly model = 'deterministic-realtime-v1';
  readonly groundedRenderingSupport = 'inspectable_verbatim' as const;

  constructor(private readonly config: RealtimeSessionConfig) {
    super();
  }

  async issueClientConnection(): Promise<RealtimeClientConnection> {
    this.assertOpen();
    this.emit({ type: 'ready', at: new Date().toISOString() });
    return {
      providerId: 'deterministic',
      providerSessionId: this.providerSessionId,
      model: this.model,
      transport: this.config.clientTransport,
      expiresAt: new Date(Date.now() + this.config.inactivityTimeoutMs).toISOString(),
      connection: { kind: 'deterministic' },
    };
  }

  /** Test/benchmark input boundary; production adapters receive equivalent provider events. */
  deliver(event: RealtimeProviderEvent): void {
    this.emit(event);
  }
}

