import { randomUUID } from 'node:crypto';
import type {
  RealtimeClientConnection,
  RealtimeClientConnectionRequest,
  RealtimeConversationProvider,
  RealtimeSessionConfig,
} from './contracts';
import { ProviderSessionBase } from './providerSessionBase';

interface OpenAIRealtimeProviderOptions {
  apiKey: string;
  model: string;
  connectionTimeoutMs: number;
  maxSessionDurationMs: number;
  fetchImpl?: typeof fetch;
}

export class OpenAIRealtimeConversationProvider implements RealtimeConversationProvider {
  readonly id = 'openai';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAIRealtimeProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createSession(config: RealtimeSessionConfig): Promise<OpenAIRealtimeProviderSession> {
    if (!this.options.apiKey) throw new Error('OpenAI Realtime is not configured');
    if (config.clientTransport !== 'webrtc' && config.clientTransport !== 'native') {
      throw new Error('OpenAI Realtime requires a WebRTC-capable client transport');
    }
    return new OpenAIRealtimeProviderSession(config, this.options, this.fetchImpl);
  }
}

export class OpenAIRealtimeProviderSession extends ProviderSessionBase {
  readonly providerSessionId = `openai_${randomUUID()}`;
  readonly model: string;
  readonly groundedRenderingSupport = 'contract_only_benchmark_required' as const;

  constructor(
    private readonly config: RealtimeSessionConfig,
    private readonly options: OpenAIRealtimeProviderOptions,
    private readonly fetchImpl: typeof fetch
  ) {
    super();
    this.model = options.model;
  }

  async issueClientConnection(request?: RealtimeClientConnectionRequest): Promise<RealtimeClientConnection> {
    this.assertOpen();
    const clientSdp = request?.clientSdp?.trim();
    if (!clientSdp || clientSdp.length > 200_000) throw new Error('A bounded client SDP offer is required');

    const session = JSON.stringify({
      type: 'realtime',
      model: this.model,
      instructions: renderingInstructions(this.config),
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe', language: languageCode(this.config.language) },
          turn_detection: { type: 'semantic_vad', create_response: false, interrupt_response: true },
        },
        output: { voice: this.config.voiceProfile.providerVoiceHint || 'coral' },
      },
    });
    const form = new FormData();
    form.set('sdp', clientSdp);
    form.set('session', session);
    const response = await this.fetchImpl('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(this.options.connectionTimeoutMs),
    });
    if (!response.ok) throw new Error(`OpenAI Realtime connection failed (${response.status})`);
    const answerSdp = await response.text();
    if (!answerSdp || answerSdp.length > 200_000) throw new Error('OpenAI Realtime returned an invalid SDP answer');
    this.emit({ type: 'ready', at: new Date().toISOString() });
    return {
      providerId: 'openai',
      providerSessionId: this.providerSessionId,
      model: this.model,
      transport: this.config.clientTransport,
      expiresAt: new Date(Date.now() + this.options.maxSessionDurationMs).toISOString(),
      connection: { kind: 'webrtc_answer', answerSdp },
    };
  }
}

function renderingInstructions(config: RealtimeSessionConfig): string {
  const style = config.voiceProfile.speakingStyle.slice(0, 6).join(', ');
  return [
    'You are an audio transport for Hey City, not an autonomous assistant.',
    'Transcribe user audio but never choose tools, places, navigation, memory, or resume behavior.',
    'Do not answer user audio automatically.',
    'When Hey City supplies approved answer text, speak it exactly without adding or changing facts.',
    `Language: ${config.language.slice(0, 20)}. Pace: ${config.voiceProfile.pace ?? 'normal'}. Style: ${style.slice(0, 240)}.`,
  ].join(' ');
}

function languageCode(language: string): string {
  return language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

