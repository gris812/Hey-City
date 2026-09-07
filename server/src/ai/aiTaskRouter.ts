import { aiRouting, openai } from '../config';
import type {
  AITaskKind,
  GenerativeProvider,
  GenerativeTaskRequest,
  GenerativeTaskResult,
} from './generativeProvider';
import { OpenAIGenerativeProvider } from './openAiGenerativeProvider';

export type ProviderRoute = string | 'deterministic';
export type AITaskRoutes = Record<AITaskKind, ProviderRoute>;

export class AITaskRouter {
  private readonly providers: Map<string, GenerativeProvider>;

  constructor(providers: GenerativeProvider[], private readonly routes: AITaskRoutes) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  routeFor(task: AITaskKind): ProviderRoute {
    return this.routes[task];
  }

  async generate(request: GenerativeTaskRequest): Promise<GenerativeTaskResult | null> {
    const providerId = this.routeFor(request.task);
    if (providerId === 'deterministic') return null;
    const provider = this.providers.get(providerId);
    if (!provider || !provider.supports(request.task)) return null;
    return provider.generate(request);
  }
}

export function createDefaultAITaskRouter(): AITaskRouter {
  const providers: GenerativeProvider[] = [];
  if (openai.apiKey) providers.push(new OpenAIGenerativeProvider());
  return new AITaskRouter(providers, {
    final_storytelling: aiRouting.primaryProvider,
    complex_follow_up: aiRouting.primaryProvider,
    evidence_compression: aiRouting.auxiliaryProvider,
    poi_normalization: aiRouting.auxiliaryProvider,
    relevance_classification: aiRouting.auxiliaryProvider,
  });
}
