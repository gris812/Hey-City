import assert from 'node:assert/strict';
import { createSession, finishActiveStory, getSession, pingSession, stopSession } from '../src/services/driveSession';
import { evaluateAheadDiscovery } from '../src/services/aheadDiscovery';
import { selectStory } from '../src/services/selectedStory';
import { narrativeGenerator, NarrativeGenerationRequest } from '../src/services/narrativeGenerator';
import { fixture } from './narrativeFixtures';

async function run() {
  const session = createSession('selected-journey-user', {
    mode: 'walking', themeTags: ['history'], narrationStyle: 'conversational',
    lengthSec: 30, leadTimeMin: 2, voiceId: 'dana', language: 'en', autoplay: true,
  });
  await evaluateAheadDiscovery({
    sessionId: session.id,
    movement: { latitude: 38.627, longitude: -90.1994, headingDegrees: 0, speedMps: 1, accuracyMeters: 10, timestamp: new Date().toISOString() },
    provider: { name: 'google', searchAhead: async () => ['one', 'two'].map(id => ({
      providerId: `selected-${id}`, provider: 'google' as const, name: id === 'one' ? 'Federal Hall' : 'Customs House',
      targetType: 'museum' as const, latitude: 38.627, longitude: -90.1994, providerTypes: ['museum'],
    })) },
  });

  const originalFetch = globalThis.fetch;
  const originalGenerate = narrativeGenerator.generate;
  const calls: NarrativeGenerationRequest[] = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ query: { pages: {
    '1': { pageid: 1, title: 'Federal Hall', coordinates: [{ lat: 38.627, lon: -90.1994 }], extract: fixture().brief.evidence.items.map(item => item.claim).join(' ') },
  } } }));
  narrativeGenerator.generate = async request => {
    calls.push(request);
    return { text: `Narration ${calls.length}`, providerId: 'fixture', cached: false };
  };

  try {
    await selectStory(session.id, 'selected-journey-user', 'selected-one', 'short');
    const first = session.journeyState.getActiveMoment();
    assert.ok(first, 'successful narration starts a journey moment');
    assert.equal(first.entityId, 'selected-one');
    assert.equal(session.journeyState.getSnapshot().recent.outcomes.length, 0, 'starting is not completion');

    await finishActiveStory(session.id, 'ended', session.journeyState.getActiveMoment()?.momentId);
    assert.equal(session.journeyState.getSnapshot().recent.outcomes.at(-1)?.reason, 'completed');
    assert.ok(session.storyContinuation, 'M1 short continuation survives completion');

    await selectStory(session.id, 'selected-journey-user', 'selected-one', 'long');
    assert.equal(calls.at(-1)?.brief.continuation?.previousTranscript, 'Narration 1', 'M1 long request still receives the short continuation');
    const longMoment = session.journeyState.getActiveMoment();
    assert.ok(longMoment);

    await selectStory(session.id, 'selected-journey-user', 'selected-two', 'short');
    const outcomes = session.journeyState.getSnapshot().recent.outcomes;
    assert.equal(outcomes.some(outcome => outcome.momentId === longMoment.momentId && outcome.reason === 'superseded'), true,
      'a new explicit selection supersedes the active moment');
    assert.equal(session.journeyState.getActiveMoment()?.entityId, 'selected-two');
    assert.equal(session.storyContinuation?.poiId, 'selected-two', 'a different selected POI replaces the prior M1 continuation');
    const staleFinish = await finishActiveStory(session.id, 'ended', longMoment.momentId);
    assert.equal(staleFinish?.stale, true, 'an old audio callback cannot finish a newer selection');
    assert.equal(session.journeyState.getActiveMoment()?.entityId, 'selected-two');
    assert.equal(session.journeyState.getSnapshot().recent.outcomes.some(outcome =>
      outcome.entityId === 'selected-two' && outcome.reason === 'completed'), false);

    await selectStory(session.id, 'selected-journey-user', 'selected-two', 'long');
    assert.equal(calls.at(-1)?.brief.continuation, undefined, 'a superseded short segment cannot become ALREADY HEARD context');
    assert.equal(session.journeyState.getSnapshot().recent.outcomes.at(-1)?.reason, 'superseded');

    const outcomesBeforeIdentify = session.journeyState.getSnapshot().recent.outcomes.length;
    await selectStory(session.id, 'selected-journey-user', 'selected-one', 'identify');
    assert.equal(session.journeyState.getActiveMoment(), undefined, 'identification does not create a factual journey moment');
    assert.equal(session.journeyState.getSnapshot().recent.outcomes.length, outcomesBeforeIdentify + 1, 'identification only supersedes the existing factual moment');

    const racing = createSession('selected-journey-user', session.params);
    try {
      await evaluateAheadDiscovery({
        sessionId: racing.id,
        movement: {latitude:40.7074,longitude:-74.0104,headingDegrees:180,speedMps:10,
          accuracyMeters:10,timestamp:new Date().toISOString()},
        provider: {name:'google',searchAhead:async () => [{providerId:'race-choice',provider:'google' as const,
          name:'Chosen Place',targetType:'museum' as const,latitude:40.7074,longitude:-74.0104,
          providerTypes:['museum']}]},
      });
      let startGeneration!: () => void;
      const generationStarted = new Promise<void>(resolve => {startGeneration = resolve;});
      let releaseGeneration!: () => void;
      const generationGate = new Promise<void>(resolve => {releaseGeneration = resolve;});
      narrativeGenerator.generate = async request => {
        startGeneration();
        await generationGate;
        return {text:'Late automatic narration',providerId:'fixture',cached:false};
      };
      const automatic = pingSession(racing.id,40.7074,-74.0104,180,35,Date.now());
      await generationStarted;
      const selected = await selectStory(racing.id,'selected-journey-user','race-choice','identify');
      assert.equal(selected.level,'identify');
      releaseGeneration();
      const staleAutomatic = await automatic;
      assert.equal(staleAutomatic.nextAction,'NONE','a superseded automatic generation cannot claim playback');
      assert.equal(racing.journeyState.getActiveMoment(),undefined,'late generation cannot replace explicit selection');
      assert.deepEqual(racing.journeyState.getSnapshot().recent.entities,[],'unheard generation never commits memory');
    } finally {stopSession(racing.id); assert.equal(getSession(racing.id),null,'stopped session releases JourneyState');}
  } finally {
    globalThis.fetch = originalFetch;
    narrativeGenerator.generate = originalGenerate;
    stopSession(session.id);
  }
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
