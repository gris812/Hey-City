import assert from 'node:assert/strict';
import type { NarrativePlan } from '@heycity/shared';
import { AITaskRouter, type AITaskRoutes } from '../src/ai/aiTaskRouter';
import type {
  AITaskKind,
  GenerativeProvider,
  GenerativeTaskRequest,
  GenerativeTaskResult,
} from '../src/ai/generativeProvider';
import { NarrativeGenerator } from '../src/services/narrativeGenerator';
import { OpenAIGenerativeProvider } from '../src/ai/openAiGenerativeProvider';
import { openai } from '../src/config';

class StubProvider implements GenerativeProvider {
  readonly id = 'quality';
  calls: GenerativeTaskRequest[] = [];

  supports(task: AITaskKind): boolean {
    return task === 'final_storytelling';
  }

  async generate(request: GenerativeTaskRequest): Promise<GenerativeTaskResult> {
    this.calls.push(request);
    return { text: 'A grounded final story.', providerId: this.id, model: 'quality-model' };
  }
}

const routes: AITaskRoutes = {
  final_storytelling: 'quality',
  complex_follow_up: 'quality',
  evidence_compression: 'deterministic',
  poi_normalization: 'deterministic',
  relevance_classification: 'deterministic',
};

async function run(): Promise<void> {
  const provider = new StubProvider();
  const router = new AITaskRouter([provider], routes);
  assert.equal(router.routeFor('final_storytelling'), 'quality');
  assert.equal(router.routeFor('poi_normalization'), 'deterministic');
  assert.equal(await router.generate({ task: 'poi_normalization', instructions: '', input: '' }), null);

  const plan: NarrativePlan = {
    poiId: 'router_test_unique_poi',
    placeName: 'Federal Hall',
    mode: 'walking',
    guideId: 'dana',
    themeTags: ['history'],
    storySeed: 'George Washington took the oath of office here.',
    targetDurationSec: 90,
    safety: { vehicleSafe: false, maxDurationSec: 90, visualLoad: 'normal' },
    structure: ['hook', 'context', 'fact', 'closing'],
  };
  const generator = new NarrativeGenerator(router);
  const result = await generator.generate({
    plan,
    language: 'en',
    narrationStyle: 'documentary',
    userId: 'router-test-user',
  });
  assert.equal(result.text, 'A grounded final story.');
  assert.equal(result.providerId, 'quality');
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].task, 'final_storytelling');
  assert.match(provider.calls[0].input, /"poiId":"router_test_unique_poi"/);
  assert.match(provider.calls[0].input, /"targetDurationSec":90/);

  await generator.generate({
    plan: { ...plan, guideId: 'artur' },
    language: 'en',
    narrationStyle: 'documentary',
  });
  assert.equal(provider.calls.length, 2, 'guide identity must be part of the story cache key');

  const failingProvider: GenerativeProvider = {
    id: 'quality',
    supports: () => true,
    generate: async () => { throw new Error('provider down'); },
  };
  const fallbackGenerator = new NarrativeGenerator(new AITaskRouter([failingProvider], routes));
  const fallback = await fallbackGenerator.generate({
    plan: { ...plan, poiId: 'router_fallback_unique_poi' },
    language: 'en',
    narrationStyle: 'documentary',
  });
  assert.equal(fallback.providerId, 'deterministic');
  assert.match(fallback.text, /Federal Hall/);

  const savedFetch = globalThis.fetch, savedKey = openai.apiKey;
  openai.apiKey = 'test-only';
  try {
    globalThis.fetch = async (_url, options) => {
      assert(options?.signal, 'provider requests have a deadline');
      return new Response(JSON.stringify({status:'completed',output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text:'Здесь город встречается с рекой.'}]}],usage:{input_tokens:10,output_tokens:10}}));
    };
    const raw = await new OpenAIGenerativeProvider().generate({task:'final_storytelling',instructions:'Russian',input:'Facts'});
    assert.equal(raw.text,'Здесь город встречается с рекой.','parse the real REST message envelope, not SDK-only output_text');
    await assert.rejects(generator.generate({plan:{...plan,poiId:'wrong_language'},language:'ru',narrationStyle:'conversational'}),/Рассказ пока не готов/);
    await assert.rejects(fallbackGenerator.generate({plan:{...plan,poiId:'no_raw_source',storySeed:'Category: city. Source: https://example.com\nEnglish evidence.'},language:'ru',narrationStyle:'conversational'}),/Рассказ пока не готов/);
  } finally {globalThis.fetch=savedFetch;openai.apiKey=savedKey;}

  console.log('aiTaskRouter tests passed');
}

void run();
