import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { media, openai, storyPreparation } from '../src/config';
import * as db from '../src/services/database';
import { evaluateAheadDiscovery, sessionDiscoveryCandidate } from '../src/services/aheadDiscovery';
import { createSession, finishActiveStory, stopSession } from '../src/services/driveSession';
import { recordNativeNarrativeEvent } from '../src/services/narrativeTelemetry';
import { getHistory, rateHistoryStory } from '../src/services/history';
import { narrativeGenerator } from '../src/services/narrativeGenerator';
import { classifyKnowledgeRefusal, selectStory } from '../src/services/selectedStory';
import { invalidateStoryPreparation, offerStoryPreparation, preparationWindow, preparedAudioHint } from '../src/services/storyPreparation';
import { cachedDiscoveryKnowledge, retrieveDiscoveryKnowledge } from '../src/services/discoveryKnowledge';
import { storyAvailability } from '../src/services/evidence';
import { getOrCreateUser, updateUser } from '../src/services/user';

async function run() {
  const dir = await mkdtemp(join(tmpdir(), 'heycity-prep-'));
  const originalQuery = db.query;
  const realDatabaseEnabled = db.databaseEnabled;
  const realGenerate = narrativeGenerator.generate;
  const realFetch = globalThis.fetch;
  const originalMedia = media.directory;
  const originalKey = openai.apiKey;
  const events: Record<string, unknown>[] = [];
  const user = await getOrCreateUser('predictive-test@example.test');
  let budget = 0, generated = 0, tts = 0, failTts = false;
  let gate: Promise<void> | undefined;
  const claims = 'The Mower County Fairgrounds is home to an unusually large fiberglass cow.';
  const makeSession = () => createSession(user.id, { mode: 'vehicle', themeTags: ['mixed'], narrationStyle: 'documentary',
    lengthSec: 30, leadTimeMin: 2, voiceId: 'dana', language: 'en', autoplay: true });
  const seed = async (session: ReturnType<typeof makeSession>, sparse = false) => {
    const providerId = sparse ? 'short-only' : 'cow';
    await evaluateAheadDiscovery({
      sessionId: session.id,
      movement: { latitude: 43.632, longitude: -92.989917, headingDegrees: 0, speedMps: 28, accuracyMeters: 10, timestamp: new Date().toISOString() },
      provider: { name: 'google', searchAhead: async () => [{ provider: 'google', providerId,
        name: sparse ? 'Sparrow County Museum' : 'Buffy the Cow', latitude: 43.662268, longitude: -92.989917, targetType: 'cultural_landmark', providerTypes: ['tourist_attraction'] }] },
    });
    return sessionDiscoveryCandidate(session.id, providerId)!;
  };
  const waitFor = async (stage: string) => {
    for (let i = 0; i < 150; i++) {
      if (events.some(item => item.stage === stage)) return;
      await delay(5);
    }
    throw new Error(`Missing stage ${stage}`);
  };
  // Use the genuine scheduler, plan, explicit-selection controller and media path with bounded deterministic test providers.
  Object.assign(db, { databaseEnabled: () => true, query: async (sql: string, params: unknown[]) => {
    if (sql.includes('story_preparation_budget')) return ++budget <= storyPreparation.dailyJobs ? [{ granted: true, audio: true }] : [];
    if (sql.includes('INSERT INTO usage_events')) events.push(JSON.parse(String(params[7])));
    return [];
  } });
  Object.assign(storyPreparation, { enabled: true, pilotUserId: user.id, dailyJobs: 8, dailyAudioJobs: 8 });
  media.directory = dir;
  openai.apiKey = 'test-only';
  narrativeGenerator.generate = async ({ plan }) => {
    const id = ++generated;
    await delay(35);
    await gate;
    return { text: `${claims} ${plan.guideId} specimen ${id}.`, cached: false, providerId: 'fixture' };
  };
  const wikiRequests: string[] = [];
  globalThis.fetch = async url => {
    const address = new URL(String(url));
    if (address.hostname === 'en.wikipedia.org') {
      wikiRequests.push(address.searchParams.get('titles') ?? 'additional lookup');
      return Response.json({ query: { pages: { '42': { pageid: 42, title: 'Sparrow County Museum',
        coordinates: [{ lat: 43.662268, lon: -92.989917 }],
        extract: 'Sparrow County Museum opened in 1921 in the restored county railway depot to conserve photographs, maps, passenger records and tools donated by former railway workers and their families.' } } } });
    }
    if (String(url).includes('/audio/speech')) {
      tts++;
      await delay(25);
      return failTts ? new Response('', { status: 503 }) : new Response(new Uint8Array([0x49, 0x44, 0x33]));
    }
    throw new Error('Speculative work made an unexpected network call');
  };
  assert.equal(preparationWindow(120, 12000, 8000, 150), 'audio');
  assert.equal(preparationWindow(15, 12000, 8000, 150), 'text');
  assert.equal(preparationWindow(12, 15000, 8000, 150), 'none');
  assert.equal(classifyKnowledgeRefusal({ evidence: null, definitive: true, attempts: [] }), 'insufficient_evidence');
  assert.equal(classifyKnowledgeRefusal({ evidence: null, attempts: [{ level: 'L2', status: 'no_match', latencyMs: 22 }] }), 'entity_resolution');
  assert.equal(classifyKnowledgeRefusal({ evidence: null, attempts: [{ level: 'L2', status: 'error', latencyMs: 500 }] }), 'transient');
  const sessions = [];
  try {
    const baseline = makeSession(); sessions.push(baseline);
    const baselineCandidate = await seed(baseline);
    storyPreparation.pilotUserId = '';
    offerStoryPreparation(baseline, baselineCandidate, 100);
    assert.equal(events.length, 0, 'no account configured means no preparation or recording');
    storyPreparation.pilotUserId = 'different-user';
    offerStoryPreparation(baseline, baselineCandidate, 100);
    assert.equal(events.length, 0, 'an unlisted authenticated account stays in the disabled arm');
    storyPreparation.pilotUserId = user.id;
    let started = performance.now();
    await selectStory(baseline.id, user.id, 'cow', 'short', 'en', 'baseline');
    const baselineDeliveryMs = performance.now() - started;

    const precomputed = makeSession(); sessions.push(precomputed);
    const candidate = await seed(precomputed);
    assert(candidate); assert(candidate.isAhead);
    const discovered = performance.now();
    offerStoryPreparation(precomputed, candidate, 100);
    await waitFor('audio_ready');
    const discoveryToAudioMs = performance.now() - discovered;
    assert.equal(precomputed.journeyState.getActiveMoment(), undefined, 'preparation cannot create playback ownership');
    const calls = { generated, tts };
    started = performance.now();
    const prepared = await selectStory(precomputed.id, user.id, 'cow', 'short', 'en', 'prepared');
    const preparedDeliveryMs = performance.now() - started;
    assert(prepared.audioUrl);
    assert.deepEqual({ generated, tts }, calls, 'no second paid path for ready preparation');

    const inFlight = makeSession(); sessions.push(inFlight);
    events.length = 0;
    let unblock!: () => void;
    gate = new Promise<void>(resolve => { unblock = resolve; });
    offerStoryPreparation(inFlight, await seed(inFlight), 100);
    await waitFor('text_preparing');
    const before = generated;
    const during = selectStory(inFlight.id, user.id, 'cow', 'short', 'en', 'same-request');
    assert.equal(during, selectStory(inFlight.id, user.id, 'cow', 'short', 'en', 'same-request'));
    unblock();
    await during;
    gate = undefined;
    assert(generated <= before + 1, 'the selection waits for the in-flight preparation');
    assert(events.some(item => item.stage === 'reused' && item.reuseMode === 'in_progress'));

    const changing = makeSession(); sessions.push(changing);
    events.length = 0;
    offerStoryPreparation(changing, await seed(changing), 100);
    await waitFor('text_preparing');
    changing.params.voiceId = 'arthur';
    invalidateStoryPreparation(changing);
    const changed = await selectStory(changing.id, user.id, 'cow', 'short', 'en', 'changed-guide');
    assert.equal(changed.guideId, 'arthur');
    assert(!events.some(item => item.stage === 'reused'));

    const failure = makeSession(); sessions.push(failure);
    events.length = 0; failTts = true;
    offerStoryPreparation(failure, await seed(failure), 100);
    await waitFor('failed');
    const failedCalls = tts;
    const text = await selectStory(failure.id, user.id, 'cow', 'short', 'en', 'text-fallback');
    assert.equal(text.audioUrl, ''); assert(text.transcriptText);
    assert.equal(tts, failedCalls, 'a failed speculative TTS is not charged again immediately');
    failTts = false;

    const canceled = makeSession(); sessions.push(canceled);
    events.length = 0;
    offerStoryPreparation(canceled, await seed(canceled), 100);
    await waitFor('text_preparing');
    stopSession(canceled.id);
    await waitFor('expired');
    assert.equal(canceled.journeyState.getActiveMoment(), undefined);
    // A restarted process has no prepared payload, while its durable budget row survives.
    const fresh = makeSession(); sessions.push(fresh);
    await seed(fresh);
    assert((await selectStory(fresh.id, user.id, 'cow', 'short', 'en', 'after-restart')).audioUrl);

    const shortOnly = makeSession(); sessions.push(shortOnly);
    events.length = 0;
    const sparse = await seed(shortOnly, true);
    offerStoryPreparation(shortOnly, sparse, 100);
    await waitFor('audio_ready');
    assert.equal(await cachedDiscoveryKnowledge(sparse), null, 'a warm lookup cannot shadow full retrieval');
    const warmed = (await retrieveDiscoveryKnowledge(sparse, true)).evidence!;
    assert.deepEqual(storyAvailability(warmed), { short: true, long: false });
    await delay(5);
    assert.equal((await preparedAudioHint(shortOnly, sparse.providerId))?.poiId, sparse.providerId);
    assert.equal(await preparedAudioHint(shortOnly, 'other-museum'), undefined);
    assert.equal(await recordNativeNarrativeEvent(shortOnly.id, user.id, { status: 'surfaced', poiId: sparse.providerId }), 'recorded');
    assert.equal(await recordNativeNarrativeEvent(shortOnly.id, user.id, { status: 'surfaced', poiId: sparse.providerId }), 'duplicate');
    assert(events.some(event => event.poiId === sparse.providerId && !event.sessionId && !event.momentId));
    const sparseCalls = { generated, tts };
    assert((await selectStory(shortOnly.id, user.id, sparse.providerId, 'short', 'en', 'short-only')).audioUrl);
    assert.deepEqual({ generated, tts }, sparseCalls, 'Tell Now reuses the prepared short-only artifact');
    assert.deepEqual(wikiRequests, ['Sparrow County Museum'], 'short preparation and selection share one free title lookup');

    Object.assign(db, { databaseEnabled: realDatabaseEnabled, query: originalQuery });
    assert.equal((await finishActiveStory(inFlight.id, 'skipped', inFlight.journeyState.getActiveMoment()?.momentId))?.ok, true);
    assert.equal((await finishActiveStory(precomputed.id, 'ended', prepared.momentId))?.ok, true);
    assert.equal((await finishActiveStory(precomputed.id, 'ended', prepared.momentId))?.stale, true);
    const [entry] = await getHistory(user.id);
    assert(entry.metadata?.artifactId);
    assert.equal((await getHistory(user.id)).length, 1, 'skip and duplicate finish never create rating rows');
    assert.equal(await rateHistoryStory('someone-else', entry.id, 'liked'), false);
    assert.equal(await rateHistoryStory(user.id, entry.id, 'liked'), true);
    const stamp = entry.metadata?.ratedAt;
    assert.equal(await rateHistoryStory(user.id, entry.id, 'liked'), true);
    assert.equal(entry.metadata?.ratedAt, stamp);
    assert.equal(await rateHistoryStory(user.id, entry.id, 'disliked'), true);
    assert.equal(entry.metadata?.rating, 'disliked');
    await updateUser(user.id, { historyEnabled: false });
    assert.equal(await rateHistoryStory(user.id, entry.id, 'liked'), false);
    console.log(JSON.stringify({ provider: 'fixture', baselineDeliveryMs: Math.round(baselineDeliveryMs),
      preparedDeliveryMs: Math.round(preparedDeliveryMs), discoveryToAudioMs: Math.round(discoveryToAudioMs), scope: 'server audio URL delivery; not native audible start', generated, tts }));
  } finally {
    for (const session of sessions) stopSession(session.id);
    Object.assign(db, { databaseEnabled: realDatabaseEnabled, query: originalQuery });
    globalThis.fetch = realFetch; narrativeGenerator.generate = realGenerate;
    media.directory = originalMedia; openai.apiKey = originalKey;
    await rm(dir, { recursive: true, force: true });
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
