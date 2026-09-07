import { openai } from '../config';
import { recordUsage } from '../services/usage';
import type {
  AITaskKind,
  GenerativeProvider,
  GenerativeTaskRequest,
  GenerativeTaskResult,
} from './generativeProvider';

const SUPPORTED_TASKS = new Set<AITaskKind>([
  'final_storytelling',
  'complex_follow_up',
  'evidence_compression',
  'poi_normalization',
  'relevance_classification',
]);

export class OpenAIGenerativeProvider implements GenerativeProvider {
  readonly id = 'openai';

  supports(task: AITaskKind): boolean {
    return SUPPORTED_TASKS.has(task);
  }

  async generate(request: GenerativeTaskRequest): Promise<GenerativeTaskResult> {
    if (!openai.apiKey) throw new Error('OpenAI provider is not configured');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: openai.textModel,
        instructions: request.instructions,
        input: request.input,
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI text error: ${response.status} ${(await response.text()).slice(0, 300)}`);
    }
    const data = await response.json() as {
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    if (!data.output_text) throw new Error('OpenAI returned empty text');

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    await recordUsage({
      userId: request.userId,
      category: 'openai_text',
      operation: openai.textModel,
      inputTokens,
      outputTokens,
      estimatedCostUsd:
        inputTokens / 1e6 * openai.textInputUsdPerMillion +
        outputTokens / 1e6 * openai.textOutputUsdPerMillion,
      metadata: { aiTask: request.task, provider: this.id },
    });

    return { text: data.output_text, providerId: this.id, model: openai.textModel };
  }
}
