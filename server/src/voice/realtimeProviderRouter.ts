import { openai, realtimeVoice } from '../config';
import type { RealtimeConversationProvider, RealtimeProviderSession, RealtimeSessionConfig } from './contracts';
import { DeterministicRealtimeConversationProvider } from './deterministicRealtimeProvider';
import { GeminiLiveConversationProvider } from './geminiLiveProvider';
import { OpenAIRealtimeConversationProvider } from './openAIRealtimeProvider';

export class RealtimeProviderRouter {
  private readonly providers: Map<string, RealtimeConversationProvider>;

  constructor(providers: RealtimeConversationProvider[], readonly defaultProviderId: string) {
    this.providers = new Map(providers.map(provider => [provider.id, provider]));
    if (this.providers.size !== providers.length) throw new Error('Duplicate realtime provider id');
  }

  resolve(providerId = this.defaultProviderId): RealtimeConversationProvider {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unsupported realtime provider: ${providerId || '(not configured)'}`);
    return provider;
  }

  createSession(config: RealtimeSessionConfig, providerId?: string): Promise<RealtimeProviderSession> {
    return this.resolve(providerId).createSession(config);
  }

  providerIds(): string[] {
    return [...this.providers.keys()];
  }
}

export function createConfiguredRealtimeProviderRouter(fetchImpl: typeof fetch = fetch): RealtimeProviderRouter {
  return new RealtimeProviderRouter([
    new OpenAIRealtimeConversationProvider({
      apiKey: openai.apiKey,
      model: realtimeVoice.openAIModel,
      connectionTimeoutMs: realtimeVoice.connectionTimeoutMs,
      maxSessionDurationMs: realtimeVoice.maxSessionDurationMs,
      fetchImpl,
    }),
    new GeminiLiveConversationProvider({
      apiKey: realtimeVoice.geminiApiKey,
      model: realtimeVoice.geminiModel,
      connectionTimeoutMs: realtimeVoice.connectionTimeoutMs,
      clientCredentialTtlMs: realtimeVoice.clientCredentialTtlMs,
      maxSessionDurationMs: realtimeVoice.maxSessionDurationMs,
      fetchImpl,
    }),
    new DeterministicRealtimeConversationProvider(),
  ], realtimeVoice.provider);
}

let configuredRouter: RealtimeProviderRouter | undefined;
export function getRealtimeProviderRouter(): RealtimeProviderRouter {
  return configuredRouter ??= createConfiguredRealtimeProviderRouter();
}

export function setRealtimeProviderRouterForTests(router: RealtimeProviderRouter | undefined): void {
  configuredRouter = router;
}

