import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { AITaskRouter, AITaskRoutes } from '../src/ai/aiTaskRouter';
import { OpenAIGenerativeProvider } from '../src/ai/openAiGenerativeProvider';
import { NarrativeGenerator, narrativeGenerator } from '../src/services/narrativeGenerator';
import { generateNarrationFromPlan } from '../src/services/narration';
import { openai } from '../src/config';
import { normalizeEvidence, storyAvailability } from '../src/services/evidence';
import { discoveryEvidence } from '../src/services/discoveryKnowledge';
import { prepareNarrative } from '../src/services/narrativePlan';
import { validateStory } from '../src/services/storyQa';
import { media } from '../src/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DiscoveryCandidate } from '@heycity/shared';
import type { NarrativeGenerationRequest } from '../src/services/narrativeGenerator';

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
  const create = async (request: NarrativeGenerationRequest) => {
    const started = performance.now(); const result = await generator.generate(request); durations.push(performance.now()-started);
    validateStory(result.text, request.brief); return result;
  };
  const federalHall = candidate('m1-live-federal-hall','Federal Hall','historical_landmark',40.7074,-74.0104);
  const goldenGate = candidate('m1-live-golden-gate-bridge','Golden Gate Bridge','bridge',37.8199,-122.4783);
  const federalEvidence = await requireProductionEvidence(federalHall);
  const goldenGateEvidence = await requireProductionEvidence(goldenGate);
  const danaRequest = requestFromProductionEvidence(federalHall, federalEvidence, 'dana', 'ru');
  const arthurRequest = requestFromProductionEvidence(federalHall, federalEvidence, 'arthur', 'ru');
  const goldenGateRequest = requestFromProductionEvidence(goldenGate, goldenGateEvidence, 'dana', 'en');
  const dana = await create(danaRequest); const arthur = await create(arthurRequest);
  const goldenGateStory = await create(goldenGateRequest);
  assert.notEqual(dana.text,arthur.text);
  const continuationRequest = requestFromProductionEvidence(federalHall, federalEvidence, 'dana', 'ru', 'long', {poiId:danaRequest.plan.poiId,guideId:'dana',language:'ru',previousLevel:'short',previousTranscript:dana.text});
  const continuation = await create(continuationRequest);
  assert(!continuation.text.startsWith(dana.text));
  const weak = normalizeEvidence({id:'weak',name:'Example Local Monument',category:'monument'},'', 'google');
  assert.deepEqual(storyAvailability(weak),{short:false,long:false});
  const vehicle = requestFromProductionEvidence(federalHall, federalEvidence, 'dana', 'ru', 'long', undefined, 'vehicle');
  assert.equal(vehicle.plan.targetDurationSec,45);
  const originalGenerate = narrativeGenerator.generate;
  narrativeGenerator.generate = generator.generate.bind(generator);
  const ttsStarted = performance.now();
  try { await generateNarrationFromPlan(danaRequest.plan,danaRequest); }
  finally { narrativeGenerator.generate=originalGenerate; }
  const ttsFirstByteMs = performance.now()-ttsStarted;
  const inputChars = [danaRequest,arthurRequest,goldenGateRequest,continuationRequest].reduce((sum,r)=>sum+JSON.stringify(r.brief).length+JSON.stringify(r.plan).length,0);
  const outputChars = dana.text.length+arthur.text.length+goldenGateStory.text.length+continuation.text.length;
  const estimatedTextCostUsd = inputChars/4/1e6*openai.textInputUsdPerMillion + outputChars/4/1e6*openai.textOutputUsdPerMillion;
  const estimatedTtsCostUsd = dana.text.length/4/1e6*openai.ttsInputUsdPerMillion + Math.ceil(dana.text.length/14)*20/1e6*openai.ttsOutputUsdPerMillion;
  console.log(JSON.stringify({ status:'PASS_DETERMINISTIC_CHECKS_REVIEW_SAMPLES_MANUALLY', model:openai.textModel,
    evidence:{federalHall:{claimCount:federalEvidence.items.length,attribution:federalEvidence.attribution},goldenGateBridge:{claimCount:goldenGateEvidence.items.length,attribution:goldenGateEvidence.attribution}},
    samples:{danaShort:dana.text,arthurShort:arthur.text,goldenGateShort:goldenGateStory.text,danaContinuation:continuation.text},
    latency:{generationMs:durations,averageGenerationMs:durations.reduce((a,b)=>a+b,0)/durations.length,ttsFirstByteMs},
    calls:{llm:llmCalls,expectedUncachedSegments:4,tts:1}, costEstimateUsd:{text:estimatedTextCostUsd,tts:estimatedTtsCostUsd},
    checks:{productionEvidencePath:true,metadataAndLanguage:true,weakEvidenceZeroStory:true,vehicleDurationSec:vehicle.plan.targetDurationSec,personasDiffer:true,continuationDoesNotRestartVerbatim:true} },null,2));
}

function candidate(providerId: string, name: string, targetType: DiscoveryCandidate['targetType'], latitude: number, longitude: number): DiscoveryCandidate {
  return {providerId,provider:'google',name,targetType,latitude,longitude,providerTypes:[targetType],distanceMeters:100,bearingDegrees:0,headingDeltaDegrees:0,isAhead:true};
}

async function requireProductionEvidence(value: DiscoveryCandidate) {
  const evidence = await discoveryEvidence(value);
  assert.ok(evidence, `production discovery evidence must resolve for ${value.name}`);
  assert.ok(storyAvailability(evidence).short, `production evidence must support a short for ${value.name}`);
  return evidence;
}

function requestFromProductionEvidence(candidate: DiscoveryCandidate, evidence: NonNullable<Awaited<ReturnType<typeof discoveryEvidence>>>, guideId: string, language: string,
  level: 'short' | 'long' = 'short', continuation?: Parameters<typeof prepareNarrative>[2]['continuation'], mode: 'walking' | 'vehicle' = 'walking'): NarrativeGenerationRequest {
  const duration = level === 'long' ? 120 : 30;
  const { plan, brief, policy } = prepareNarrative({poiId:candidate.providerId,placeName:candidate.name,mode,guideId,themeTags:['history'],targetDurationSec:duration}, evidence,
    {level,language,continuation});
  return {plan,brief,policy,language,narrationStyle:'conversational'};
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
