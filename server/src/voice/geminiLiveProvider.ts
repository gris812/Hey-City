import { randomUUID } from 'node:crypto';
import type {
  RealtimeClientConnection,
  RealtimeConversationProvider,
  RealtimeSessionConfig,
} from './contracts';
import { ProviderSessionBase } from './providerSessionBase';

const GEMINI_EPHEMERAL_TOKEN_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
const GEMINI_CONSTRAINED_LIVE_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

interface GeminiLiveProviderOptions {
  apiKey: string;
  model: string;
  connectionTimeoutMs: number;
  clientCredentialTtlMs: number;
  maxSessionDurationMs: number;
  fetchImpl?: typeof fetch;
}

export class GeminiLiveConversationProvider implements RealtimeConversationProvider {
  readonly id = 'gemini';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GeminiLiveProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createSession(config: RealtimeSessionConfig): Promise<GeminiLiveProviderSession> {
    if (!this.options.apiKey) throw new Error('Gemini Live is not configured');
    if (config.clientTransport !== 'websocket' && config.clientTransport !== 'native') {
      throw new Error('Gemini Live requires a WebSocket-capable client transport');
    }
    return new GeminiLiveProviderSession(config, this.options, this.fetchImpl);
  }
}

export class GeminiLiveProviderSession extends ProviderSessionBase {
  readonly providerSessionId = `gemini_${randomUUID()}`;
  readonly model: string;
  readonly groundedRenderingSupport = 'contract_only_benchmark_required' as const;

  constructor(
    private readonly config: RealtimeSessionConfig,
    private readonly options: GeminiLiveProviderOptions,
    private readonly fetchImpl: typeof fetch
  ) {
    super();
    this.model = options.model;
  }

  async issueClientConnection(): Promise<RealtimeClientConnection> {
    this.assertOpen();
    const now = Date.now();
    // Google currently defaults new-session eligibility to one minute. Keep our TTL at or below it.
    const credentialTtlMs = Math.min(Math.max(this.options.clientCredentialTtlMs, 1_000), 60_000);
    const expiresAt = new Date(now + credentialTtlMs).toISOString();
    const response = await this.fetchImpl(GEMINI_EPHEMERAL_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.options.apiKey },
      body: JSON.stringify({
        uses: 1,
        expireTime: expiresAt,
        newSessionExpireTime: expiresAt,
        liveConnectConstraints: {
          model: `models/${this.model}`,
          config: {
            responseModalities: ['AUDIO'],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: { parts: [{ text: renderingInstructions(this.config) }] },
          },
        },
      }),
      signal: AbortSignal.timeout(this.options.connectionTimeoutMs),
    });
    if (!response.ok) throw new Error(`Gemini Live credential request failed (${response.status})`);
    const data = await response.json() as { name?: string; token?: string };
    const token = data.token || data.name;
    if (!token || token.length > 4_096) throw new Error('Gemini Live returned an invalid ephemeral token');
    this.emit({ type: 'ready', at: new Date().toISOString() });
    return {
      providerId: 'gemini',
      providerSessionId: this.providerSessionId,
      model: this.model,
      transport: this.config.clientTransport,
      expiresAt,
      connection: { kind: 'websocket_ephemeral', url: GEMINI_CONSTRAINED_LIVE_ENDPOINT, token },
    };
  }
}

function renderingInstructions(config: RealtimeSessionConfig): string {
  const style = config.voiceProfile.speakingStyle.slice(0, 6).join(', ');
  return [
    'Act only as the realtime audio transport for Hey City.',
    'Never select places, navigation, tools, memory, or story resume behavior.',
    'Do not answer user speech independently.',
    'Speak only grounded answer text supplied by Hey City and preserve every fact exactly.',
    `Language: ${config.language.slice(0, 20)}. Pace: ${config.voiceProfile.pace ?? 'normal'}. Style: ${style.slice(0, 240)}.`,
  ].join(' ');
}

