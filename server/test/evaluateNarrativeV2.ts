import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { AITaskRouter, AITaskRoutes } from '../src/ai/aiTaskRouter';
import { OpenAIGenerativeProvider } from '../src/ai/openAiGenerativeProvider';
import { NarrativeGenerator, narrativeGenerator } from '../src/services/narrativeGenerator';
import { generateNarrationFromPlan } from '../src/services/narration';
import { openai } from '../src/config';
import { normalizeEvidence, storyAvailability } from '../src/services/evidence';
import { fixture } from './narrativeFixtures';
import { validateStory } from '../src/services/storyQa';
import { media } from '../src/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function run() {
  if (!openai.apiKey) throw new Error('OPENAI_API_KEY is required for live M1 experience QA');
  const previousMediaDirectory = media.directory;
  const qaMediaDirectory = await mkdtemp(join(tmpdir(),'heycity-m1-qa-'));
  media.directory = qaMediaDirectory;
  try { await runScenarios(); }
  finally { media.directory = previousMediaDirectory; await rm(qaMediaDirectory,{recursive:true,force:true}); }
}

async function runScenarios() {
  const routes: AITaskRoutes = { final_storytelling:'openai', complex_follow_up:'openai', evidence_compression:'deterministic', poi_normalization:'deterministic', relevance_classification:'deterministic' };
  let llmCalls = 0;
  const provider = new OpenAIGenerativeProvider();
  const measured = { id: provider.id, supports: provider.supports.bind(provider), generate: async (request: Parameters<typeof provider.generate>[0]) => { llmCalls++; return provider.generate(request); } };
  const generator = new NarrativeGenerator(new AITaskRouter([measured], routes));
  const durations: number[] = [];
  const create = async (request: ReturnType<typeof fixture>) => {
    const started = performance.now(); const result = await generator.generate(request); durations.push(performance.now()-started);
    validateStory(result.text, request.brief); return result;
  };
  const danaRequest = fixture({id:`live-federal-dana-${Date.now()}`,language:'ru'});
  const arthurRequest = fixture({id:`live-federal-arthur-${Date.now()}`,guide:'arthur',language:'ru'});
  const dana = await create(danaRequest); const arthur = await create(arthurRequest);
  assert.notEqual(dana.text,arthur.text);
  const continuationRequest = fixture({id:danaRequest.plan.poiId,level:'long',language:'ru',continuation:{poiId:danaRequest.plan.poiId,guideId:'dana',language:'ru',previousLevel:'short',previousTranscript:dana.text}});
  const continuation = await create(continuationRequest);
  assert(!continuation.text.startsWith(dana.text));
  const weak = normalizeEvidence({id:'weak',name:'Example Local Monument',category:'monument'},'', 'google');
  assert.deepEqual(storyAvailability(weak),{short:false,long:false});
  const vehicle = fixture({id:`live-vehicle-${Date.now()}`,level:'long',mode:'vehicle',language:'ru'});
  assert.equal(vehicle.plan.targetDurationSec,45);
  const originalGenerate = narrativeGenerator.generate;
  narrativeGenerator.generate = generator.generate.bind(generator);
  const ttsStarted = performance.now();
  try { await generateNarrationFromPlan(danaRequest.plan,danaRequest); }
  finally { narrativeGenerator.generate=originalGenerate; }
  const ttsFirstByteMs = performance.now()-ttsStarted;
  const inputChars = [danaRequest,arthurRequest,continuationRequest].reduce((sum,r)=>sum+JSON.stringify(r.brief).length+JSON.stringify(r.plan).length,0);
  const outputChars = dana.text.length+arthur.text.length+continuation.text.length;
  const estimatedTextCostUsd = inputChars/4/1e6*openai.textInputUsdPerMillion + outputChars/4/1e6*openai.textOutputUsdPerMillion;
  const estimatedTtsCostUsd = dana.text.length/4/1e6*openai.ttsInputUsdPerMillion + Math.ceil(dana.text.length/14)*20/1e6*openai.ttsOutputUsdPerMillion;
  console.log(JSON.stringify({ status:'PASS_DETERMINISTIC_CHECKS_REVIEW_SAMPLES_MANUALLY', model:openai.textModel,
    samples:{danaShort:dana.text,arthurShort:arthur.text,danaContinuation:continuation.text},
    latency:{generationMs:durations,averageGenerationMs:durations.reduce((a,b)=>a+b,0)/durations.length,ttsFirstByteMs},
    calls:{llm:llmCalls,expectedUncachedSegments:3,tts:1}, costEstimateUsd:{text:estimatedTextCostUsd,tts:estimatedTtsCostUsd},
    checks:{metadataAndLanguage:true,weakEvidenceZeroStory:true,vehicleDurationSec:vehicle.plan.targetDurationSec,personasDiffer:true,continuationDoesNotRestartVerbatim:true} },null,2));
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
