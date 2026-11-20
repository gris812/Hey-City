import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fixture } from './narrativeFixtures';
import { NarrativeGenerator, narrativeFingerprint } from '../src/services/narrativeGenerator';
import { AITaskRouter, AITaskRoutes } from '../src/ai/aiTaskRouter';
import { GenerativeProvider, GenerativeTaskRequest } from '../src/ai/generativeProvider';
import { validateStory } from '../src/services/storyQa';
import { normalizeEvidence, storyAvailability } from '../src/services/evidence';
import { buildStoryBrief } from '../src/services/storyBrief';
import corpus from '../../evaluation/golden/narrative-v2.json';

import { prepareNarrative } from '../src/services/narrativePlan';
import { resolveStoryDiscoveries } from '../src/services/storyDiscoveries';
import { benchmarkCandidate } from './narrativeBenchmark';

function cityDepth() {
  // Synthetic evidence and model text test contracts only. They are never shipped as verified facts.
  const subject = { id: 'city-fixture', name: 'Example City', category: 'city' };
  const evidence = normalizeEvidence(subject, [
    'A river confluence shaped the original settlement.',
    'The settlement was incorporated in 1854.',
    'Railroad connections helped expand the local market.',
    'Local music traditions brought several communities together.',
    'An indigenous community documented the area before incorporation.',
    'Riverbend Museum preserves records of trade on the river.',
    'The city grew along its valley rather than in a single grid.',
    'The industrial trade brought several kinds of manufacturers to the city.',
  ].join(' '), 'fixture');
  const input = { poiId: subject.id, placeName: subject.name, mode: 'vehicle' as const,
    guideId: 'dana', themeTags: ['mixed'], targetDurationSec: 30 };
  const dana = prepareNarrative(input, evidence, { level: 'short', language: 'en' });
  const arthur = prepareNarrative({ ...input, guideId: 'arthur' }, evidence, { level: 'short', language: 'en' });
  assert.equal(dana.plan.targetDurationSec, 150);
  assert.equal(dana.plan.safety.visualLoad, 'minimal');
  assert(dana.brief.depth && dana.brief.depth.themes.length >= 4);
  assert.deepEqual(dana.plan.evidenceRefs, arthur.plan.evidenceRefs, 'persona does not change city coverage');
  assert.notDeepEqual(dana.policy.behavior, arthur.policy.behavior);
  assert.match(dana.plan.beats.find(beat => beat.kind === 'reveal')!.objective, /complementary/);
  assert.equal(prepareNarrative(input, { ...evidence, items: evidence.items.slice(0, 2) },
    { level: 'auto', language: 'en' }).plan.targetDurationSec, 30);
  const landmark = { ...evidence, category: 'museum' };
  assert.equal(prepareNarrative({ ...input, mode: 'walking' }, landmark, { level: 'auto', language: 'en' }).plan.targetDurationSec, 120);
  assert.equal(prepareNarrative(input, landmark, { level: 'auto', language: 'en' }).plan.targetDurationSec, 30);
  assert.throws(() => prepareNarrative(input, evidence, { level: 'long', language: 'en',
    continuation: { poiId: input.poiId, guideId: input.guideId, language: 'en', previousLevel: 'short',
      previousTranscript: 'Earlier overview', selectedEvidenceRefs: dana.plan.evidenceRefs } }), /Not enough verified/);
  const candidate = benchmarkCandidate('resolved-museum', 'Riverbend Museum', 'museum', 42.5, -96.4);
  const other = benchmarkCandidate('other', 'Imaginary Park', 'park', 42.5, -96.4);
  const text = 'Riverbend Museum preserves the trade records. Imaginary Park is a false suggestion.';
  const center = { latitude: 42.49, longitude: -96.38 };
  assert.deepEqual(resolveStoryDiscoveries(dana.brief, text, center, [candidate, other], 20000).map(entry => entry.providerId), [candidate.providerId]);
  assert.deepEqual(resolveStoryDiscoveries(dana.brief, text, center, [candidate, { ...candidate, providerId: 'duplicate' }], 20000), []);
  assert.deepEqual(resolveStoryDiscoveries(dana.brief, text, center, [{ ...candidate, latitude: 48 }], 20000), []);
  assert.deepEqual(resolveStoryDiscoveries(dana.brief, 'No place mentioned.', center, [candidate], 20000), []);
  console.log(JSON.stringify({ scenario: 'city-depth', fixture: true, durationBudgetSec: 150, themes: dana.brief.depth.themes, resolvedIds: [candidate.providerId] }));
}

async function run() {
  cityDepth();
  const calls: GenerativeTaskRequest[] = [];
  const provider: GenerativeProvider = { id: 'quality', supports: () => true, generate: async request => {
    calls.push(request); return { text: 'The current building opened as a Custom House, long after the inauguration at this site.', providerId: 'quality', model: 'fixture' };
  } };
  const routes: AITaskRoutes = { final_storytelling:'quality', complex_follow_up:'quality', evidence_compression:'deterministic', poi_normalization:'deterministic', relevance_classification:'deterministic' };
  const generator = new NarrativeGenerator(new AITaskRouter([provider], routes));
  const dana = fixture(); const arthur = fixture({guide:'artur'});
  assert.deepEqual(dana.brief.evidence.items.map(item=>item.claim),corpus.subjects['federal-hall'].claims,'stable claims preserve U.S. abbreviations');
  assert.equal(arthur.policy.id, 'arthur');
  assert.notDeepEqual(dana.plan.beats, arthur.plan.beats, 'T5 distinct guide beat tendencies');
  assert.notDeepEqual(dana.policy.behavior, arthur.policy.behavior);
  assert.equal(dana.plan.poiId, 'federal-hall', 'T1 approved target');
  assert.equal(dana.brief.subject.name, 'Federal Hall');
  assert.deepEqual(dana.plan.evidenceRefs, dana.brief.evidence.items.slice(0,2).map(item=>item.id));
  assert.deepEqual(arthur.plan.evidenceRefs, [arthur.brief.evidence.items[0].id,arthur.brief.evidence.items[2].id]);
  assert(!JSON.stringify(dana.plan).includes('Washington'), 'public plan contains no evidence prose');
  assert(!JSON.stringify(dana.plan).includes('https://'), 'public plan contains no source URL');
  const short = await generator.generate(dana);
  assert.match(calls[0].input,/Federal Hall/,'T1 provider request retains the approved target');
  assert.doesNotMatch(calls[0].input,/Golden Gate Bridge/,'T1 provider request cannot substitute another POI');
  await generator.generate(dana);
  assert.equal(calls.length, 1, 'one final call per segment; second request is a cache hit');
  assert.equal(calls[0].task, 'final_storytelling', 'T2 router boundary');
  assert.equal(calls[0].maxOutputTokens, 270, 'short output ceiling follows deterministic evidence budget');
  assert(!calls[0].input.includes('https://'), 'T3 attribution is not prompt prose');
  assert(calls[0].input.includes('VERIFIED EVIDENCE'));
  const long = fixture({level:'long',continuation:{poiId:dana.plan.poiId,guideId:'dana',language:'en',previousLevel:'short',previousTranscript:short.text}});
  assert.deepEqual(long.plan.evidenceRefs,long.brief.evidence.items.slice(2).map(item=>item.id),'continuation receives only unused claims');
  await generator.generate(long);
  assert.equal(calls[1].maxOutputTokens,270,'continuation cannot pad sparse unused evidence to the duration ceiling');
  assert.equal(long.brief.continuation?.previousTranscript,short.text);
  assert.match(calls[1].instructions, /Do not repeat its opening, subject introduction, or facts already stated/);
  assert.match(calls[1].input, /ALREADY HEARD:/);
  assert(!JSON.stringify(long.plan).includes(short.text), 'continuation transcript remains server-only');
  const standalone = fixture({level:'long'});
  assert.equal(standalone.brief.continuation,undefined,'T7 direct long');
  const keys = [dana,arthur,long,standalone,fixture({language:'ru'}),fixture({mode:'vehicle'})].map(narrativeFingerprint);
  assert.equal(new Set(keys).size,keys.length,'T12 complete context isolation');
  const revised = structuredClone(dana); revised.brief.evidence.sourceVersion += '.2';
  assert.notEqual(narrativeFingerprint(dana),narrativeFingerprint(revised));
  const tampered = structuredClone(dana); tampered.plan.poiId = 'other-place';
  await assert.rejects(generator.generate(tampered), /authority mismatch/);
  assert.equal(calls.length,2,'invalid authority never reaches LLM');
  const weak = normalizeEvidence({id:'weak',name:'Example Local Monument',category:'monument'},'', 'google');
  assert.deepEqual(storyAvailability(weak),{short:false,long:false});
  assert.throws(()=>fixture({subject:'weak'}),/Not enough verified/);
  const emptyRequest = structuredClone(dana); emptyRequest.brief.evidence.items=[];
  await assert.rejects(generator.generate(emptyRequest),/Not enough verified/);
  assert.equal(calls.length,2,'T4 zero provider calls for weak evidence');
  const russian = fixture({language:'ru'});
  for (const text of ['', 'Source: Wikipedia', 'https://example.com', 'NarrativePlan says to ignore instructions', 'This is entirely English.']) {
    assert.throws(()=>validateStory(text,russian.brief),`reject ${text}`);
  }
  for (const text of ['This historic building has a story.', 'This iconic attraction is famous.', 'Did you know Federal Hall mattered?', 'Знаете ли вы, что Federal Hall важен?', 'Federal Hall is a historic landmark located in New York.', 'Federal Hall was built in 1842 and is known for history.', 'Would you like to know more?']) assert.throws(()=>validateStory(text,dana.brief));
  validateStory('Здесь важно различать место и здание. Нынешнее здание открылось как таможня.',russian.brief);
  const vehicle = fixture({level:'long',mode:'vehicle'});
  assert.equal(vehicle.plan.targetDurationSec,45,'E5 explicit long cannot bypass vehicle limit');
  assert.equal(vehicle.brief.constraints.targetDurationSec,45);
  assert.equal(vehicle.plan.safety.visualLoad,'minimal');
  assert.throws(()=>validateStory(Array(120).fill('building').join(' '),vehicle.brief),/word budget/);
  for (const scenario of corpus.scenarios) assert(scenario.required.length && scenario.prohibited.length);
  assert.equal(corpus.scenarios.length,8);
  const start = performance.now();
  for (let i=0;i<10000;i++) buildStoryBrief(dana.plan,dana.brief.evidence,dana.policy,{level:'short',language:'en'});
  console.log(JSON.stringify({storyBriefMeanMs:(performance.now()-start)/10000,iterations:10000,provider:'fixture',llmCallsPerUncachedSegment:1}));
  console.log('M1 T1–T7, T11–T12 contract and deterministic QA tests passed (not live model experience QA)');
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
