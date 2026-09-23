import assert from 'node:assert/strict';
import { createSession, finishActiveStory, pingSession } from '../src/services/driveSession';
import { googleMaps } from '../src/config';
import { discoveryStorySeed } from '../src/services/discoveryKnowledge';

async function run(): Promise<void> {
  const session = createSession('gris', {
    themeTags: ['government'],
    narrationStyle: 'documentary',
    lengthSec: 40,
    leadTimeMin: 2,
    voiceId: 'artur',
    language: 'en',
    autoplay: true,
  });

  const first = await pingSession(
    session.id,
    40.7074,
    -74.0104,
    180,
    35,
    10_000
  );

  assert.equal(first.nextAction, 'PLAY');
  assert.equal(first.decision?.type, 'trigger_story');
  assert.ok(first.poi);
  assert.match(first.audioUrl ?? '', /^https:\/\/example\.com\/tts\/arthur\//);
  assert.ok(first.narrativePlan);
  assert.ok(first.transcriptText);
  assert.ok(first.estimatedDurationSec);
  assert.ok(first.estimatedDurationSec >= 30);
  assert.ok(first.estimatedDurationSec <= 45);

  const second = await pingSession(
    session.id,
    40.7073,
    -74.0105,
    92,
    35,
    20_000
  );

  assert.equal(second.nextAction, 'NONE');
  assert.equal(second.decision?.type, 'hold');
  assert.equal(second.decision?.reason, 'already_listening');

  const finished = await finishActiveStory(session.id, 'skipped');
  assert.equal(finished?.ok, true);
  assert.equal(finished?.activeStoryWasPlaying, true);
  assert.equal(finished?.reason, 'skipped');

  const third = await pingSession(
    session.id,
    40.7073,
    -74.0105,
    92,
    35,
    30_000
  );

  assert.equal(third.nextAction, 'NONE');
  assert.equal(third.decision?.type, 'hold');
  assert.equal(third.decision?.reason, 'cooldown_active');

  const walking = createSession('walker', {
    mode: 'walking',
    themeTags: ['government'],
    narrationStyle: 'documentary',
    lengthSec: 90,
    leadTimeMin: 2,
    voiceId: 'dana',
    language: 'ru',
    autoplay: true,
  });
  const walkingResult = await pingSession(
    walking.id,
    40.7074,
    -74.0104,
    null,
    4.5,
    40_000
  );
  assert.equal(walkingResult.nextAction, 'PLAY');
  assert.equal(walkingResult.decision?.type, 'trigger_story');
  assert.equal(walkingResult.decision?.type === 'trigger_story' && walkingResult.decision.mode, 'walking');
  assert.equal(walkingResult.narrativePlan?.safety.vehicleSafe, false);
  assert.match(walkingResult.audioUrl ?? '', /^https:\/\/example\.com\/tts\/dana\//);

  const originalFetch = globalThis.fetch;
  const originalKey = googleMaps.apiKey;
  googleMaps.apiKey = 'test-only';
  globalThis.fetch = async (url) => {
    const address = String(url);
    if (address.includes('geocode')) return new Response(JSON.stringify({ status: 'OK', results: [{ place_id: 'st-louis', formatted_address: 'St. Louis, MO, USA', types: ['locality'], geometry: { location: { lat: 38.627, lng: -90.1994 } } }] }));
    if (address.includes('places.googleapis')) return new Response(JSON.stringify({ places: [] }));
    if (address.includes('wikipedia')) return new Response(JSON.stringify({ query: { pages: { '1': { pageid: 1, title: 'St. Louis', coordinates: [{ lat: 38.627, lon: -90.1994 }], extract: 'St. Louis is a city in Missouri on the western bank of the Mississippi River. The city developed as a trading centre and river port. Its Gateway Arch commemorates the westward expansion of the United States.' } } } }));
    throw new Error('Unexpected external request');
  };
  try {
    const city = createSession('city-test', { ...session.params, mode: 'vehicle' });
    const result = await pingSession(city.id, 38.64, -90.1994, 0, 40, 1_000_000);
    assert.equal(result.nextAction, 'PLAY', 'city context outside NYC reaches narration even when city centre is behind');
    assert.equal(result.poi?.place_id, 'st-louis');
    assert.equal(result.poi?.geometry.location.lat, 38.627, 'provider coordinates survive conversion');
    assert.equal(result.narrativePlan?.storySeed, undefined, 'raw evidence is never serialized in the public plan');
    assert((result.narrativePlan?.evidenceRefs.length ?? 0) >= 3, 'public plan carries source identifiers only');
    assert.deepEqual(result.attribution, { label:'Wikipedia · CC BY-SA', url:'https://en.wikipedia.org/?curid=1' }, 'automatic story exposes attribution without raw evidence');
    const cityCandidate = result.aheadDiscovery!.topCandidates.find(candidate => candidate.providerId === 'st-louis')!;
    const unrelated = await discoveryStorySeed({ ...cityCandidate, providerId: 'wrong-city', latitude: 40, longitude: -74 });
    assert.equal(unrelated, null, 'a same-name article with wrong geography cannot seed a story');
    await finishActiveStory(city.id);
    const repeat = await pingSession(city.id, 38.64, -90.1994, 0, 40, 1_600_000);
    assert.equal(repeat.nextAction, 'NONE', 'city introduction does not repeat within the session');
  } finally { globalThis.fetch = originalFetch; googleMaps.apiKey = originalKey; }
  console.log('driveSessionLocal tests passed');
}

void run();
