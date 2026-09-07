import type { NarrativePlan } from '@heycity/shared';
import { AITaskRouter, createDefaultAITaskRouter } from '../ai/aiTaskRouter';
import { aiRouting, cacheTtl } from '../config';
import { cacheGet, cacheSet, storyTextCacheKey } from './cache';
import { createMockNarration } from './narrativePlan';

export interface NarrativeGenerationRequest {
  plan: NarrativePlan;
  language: string;
  narrationStyle: string;
  userId?: string;
}

export interface NarrativeGenerationResult {
  text: string;
  providerId: string;
  cached: boolean;
}

export class NarrativeGenerator {
  constructor(private readonly router: AITaskRouter = createDefaultAITaskRouter()) {}

  async generate(request: NarrativeGenerationRequest): Promise<NarrativeGenerationResult> {
    const { plan } = request;
    const cacheKey = storyTextCacheKey(
      plan.poiId,
      request.language,
      plan.themeTags[0] ?? 'mixed',
      request.narrationStyle,
      lengthBucket(plan.targetDurationSec),
      plan.guideId,
      aiRouting.promptVersion
    );
    const cached = await cacheGet<string>(cacheKey);
    if (cached) return { text: cached, providerId: 'cache', cached: true };

    let text: string;
    let providerId = 'deterministic';
    try {
      const generated = await this.router.generate({
        task: 'final_storytelling',
        userId: request.userId,
        instructions:
          'Write only the final city-guide narration. The supplied NarrativePlan is authoritative. ' +
          'Do not choose another place, change timing or duration, add route instructions, or invent facts.',
        input:
          `Language: ${request.language}\n` +
          `Narration style: ${request.narrationStyle}\n` +
          `NarrativePlan: ${JSON.stringify(plan)}`,
      });
      text = generated?.text ?? createMockNarration(plan).transcriptText;
      providerId = generated?.providerId ?? providerId;
    } catch (error) {
      console.warn('Narrative provider failed; using deterministic fallback', error);
      text = createMockNarration(plan).transcriptText;
    }

    if (providerId !== 'deterministic') {
      await cacheSet(cacheKey, text, cacheTtl.storyTextDays * 24 * 60 * 60);
    }
    return { text, providerId, cached: false };
  }
}

export const narrativeGenerator = new NarrativeGenerator();

function lengthBucket(sec: number): number {
  if (sec <= 60) return 60;
  if (sec <= 120) return 120;
  return 180;
}
