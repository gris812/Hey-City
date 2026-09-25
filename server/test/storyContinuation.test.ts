import assert from 'node:assert/strict';
import { createSession, finishActiveStory, stopSession, getSession } from '../src/services/driveSession';
import { evaluateAheadDiscovery } from '../src/services/aheadDiscovery';
import { selectStory, selectedStoryAvailability } from '../src/services/selectedStory';
import { narrativeGenerator, NarrativeGenerationRequest } from '../src/services/narrativeGenerator';
import { fixture } from './narrativeFixtures';
import { normalizeEvidence, storyAvailability } from '../src/services/evidence';
import { prepareNarrative } from '../src/services/narrativePlan';

async function run() {
  const threeClaims = normalizeEvidence({ id:'three-claims', name:'Three Claims Hall', category:'museum' },
    'The site opened as a public market in 1890. It later became a library for the surrounding neighbourhood. Its restored clock is a local landmark.', 'wikipedia', 'https://example.test/three-claims');
  assert.deepEqual(storyAvailability(threeClaims), {short:true,long:true}, 'a direct long can use all three verified claims');
  assert.deepEqual(storyAvailability(threeClaims,'dana'), {short:true,long:false}, 'a short consumes two claims, so one remaining claim cannot unlock a continuation');
  assert.throws(() => prepareNarrative({poiId:'three-claims',placeName:'Three Claims Hall',mode:'walking',guideId:'dana',themeTags:[],targetDurationSec:90}, threeClaims,
    {level:'long',language:'en',continuation:{poiId:'three-claims',guideId:'dana',language:'en',previousLevel:'short',previousTranscript:'Earlier segment.'}}));
  const session = createSession('m1-user',{mode:'walking',themeTags:['history'],narrationStyle:'conversational',lengthSec:30,leadTimeMin:2,voiceId:'dana',language:'ru',autoplay:true});
  await evaluateAheadDiscovery({sessionId:session.id,movement:{latitude:38.627,longitude:-90.1994,headingDegrees:0,speedMps:1,accuracyMeters:10,timestamp:new Date().toISOString()},provider:{name:'google',searchAhead:async()=>['one','two','weak'].map(id=>({providerId:`m1-${id}`,provider:'google' as const,name:id==='weak'?'Unknown Monument':'Federal Hall',targetType:'museum' as const,latitude:38.627,longitude:-90.1994,providerTypes:['museum']}))}});
  const originalFetch = globalThis.fetch; const originalGenerate = narrativeGenerator.generate;
  const calls: NarrativeGenerationRequest[] = [];
  globalThis.fetch = async url => {
    const pages = String(url).includes('Unknown') || String(url).includes('geosearch') ? {} : {
      '1': { pageid:1, title:'Federal Hall', coordinates:[{lat:38.627,lon:-90.1994}], extract:fixture().brief.evidence.items.map(i=>i.claim).join(' ') },
    };
    return new Response(JSON.stringify({ query: { pages } }));
  };
  narrativeGenerator.generate = async request => {calls.push(request);return {text: request.plan.level==='short'?'На этом месте Вашингтон принёс президентскую присягу.':'А нынешнее здание открылось позже как таможня.',providerId:'fixture',cached:false};};
  try {
    const identify = await selectStory(session.id,'m1-user','m1-weak','identify','ru');
    assert.match(identify.transcriptText,/Unknown Monument/); assert.doesNotMatch(identify.transcriptText,/Рассказать/);
    assert.deepEqual(await selectedStoryAvailability(session.id,'m1-user','m1-weak'),{short:false,long:false});
    await assert.rejects(selectStory(session.id,'m1-user','m1-weak','short'),(e:any)=>e.status===422);
    assert.equal(calls.length,0);
    assert.deepEqual(await selectedStoryAvailability(session.id,'m1-user','m1-one'),{short:true,long:true});
    await assert.rejects(selectedStoryAvailability(session.id,'someone-else','m1-one'),(e:any)=>e.status===404);
    await selectStory(session.id,'m1-user','m1-one','long');
    assert.equal(calls.at(-1)!.brief.continuation,undefined,'T7 direct long');
    const short = await selectStory(session.id,'m1-user','m1-one','short');
    assert.deepEqual(short.attribution, {label:'Wikipedia · CC BY-SA',url:'https://en.wikipedia.org/?curid=1'}, 'explicit story exposes display-only attribution');
    const previous = session.storyContinuation!.previousTranscript;
    await finishActiveStory(session.id, 'ended', session.journeyState.getActiveMoment()?.momentId);
    await selectStory(session.id,'m1-user','m1-one','long');
    assert.equal(calls.at(-1)!.brief.continuation?.previousTranscript,previous,'T6 successful short is shared context');
    await selectStory(session.id,'m1-user','m1-two','identify');
    assert.equal(session.storyContinuation,undefined,'another POI invalidates context immediately');
    await selectStory(session.id,'m1-user','m1-two','short');
    session.params.voiceId='artur';
    await selectStory(session.id,'m1-user','m1-two','long');
    assert.equal(calls.at(-1)!.brief.continuation,undefined,'T8 guide mismatch');
    assert.equal(calls.at(-1)!.policy.id,'arthur');
    await selectStory(session.id,'m1-user','m1-two','short','ru');
    await selectStory(session.id,'m1-user','m1-two','long','en');
    assert.equal(calls.at(-1)!.brief.continuation,undefined,'T8 language mismatch');
    session.params.mode='vehicle';
    await selectStory(session.id,'m1-user','m1-two','long');
    assert.equal(calls.at(-1)!.plan.targetDurationSec,45);
    let release!:()=>void, started!:()=>void;
    const waiting=new Promise<void>(resolve=>{started=resolve;});
    narrativeGenerator.generate=async request=>{started();await new Promise<void>(resolve=>{release=resolve;});return {text:'Отменённый рассказ.',providerId:'fixture',cached:false};};
    const old=selectStory(session.id,'m1-user','m1-one','short');
    const aborted=assert.rejects(old,/abort/i); await waiting;
    await selectStory(session.id,'m1-user','m1-two','identify'); release(); await aborted;
    assert.equal(session.storyContinuation,undefined,'T9 stale success cannot restore context');
    stopSession(session.id); assert.equal(getSession(session.id),null);
    const fresh=createSession('m1-user',session.params);assert.equal(fresh.storyContinuation,undefined);stopSession(fresh.id);
    console.log('M1 continuation, availability, owner isolation and supersede tests passed');
  } finally {globalThis.fetch=originalFetch;narrativeGenerator.generate=originalGenerate;stopSession(session.id);}
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
