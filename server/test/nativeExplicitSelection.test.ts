import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { createSession, getSession, pingSession, stopSession } from '../src/services/driveSession';
import { evaluateAheadDiscovery, sessionDiscoveryCandidate } from '../src/services/aheadDiscovery';
import { selectStory } from '../src/services/selectedStory';
import { narrativeGenerator, type NarrativeGenerationRequest } from '../src/services/narrativeGenerator';
import { fixture } from './narrativeFixtures';
import { openCircuit } from '../src/services/budget';
import { openai } from '../src/config';
import { validateStory } from '../src/services/storyQa';

process.env.NODE_ENV = 'test';
process.env.AUTH_DISABLED = 'false';
async function run() {
  const owner = 'guest_native123_abcdefg';
  const session = createSession(owner, { mode: 'vehicle', themeTags: ['history'], narrationStyle: 'conversational', lengthSec: 30, leadTimeMin: 2, voiceId: 'dana', language: 'en', autoplay: true });
  const candidates = [
    { providerId: 'explicit-a', name: 'Distant Museum', latitude: 38.7125 },
    { providerId: 'explicit-b', name: 'Museum Behind', latitude: 38.62 },
    { providerId: 'explicit-weak', name: 'Unknown Museum', latitude: 38.62 },
  ];
  const diagnostic = await evaluateAheadDiscovery({ sessionId: session.id,
    movement: { latitude: 38.627, longitude: -90.1994, headingDegrees: 0, speedMps: 30, accuracyMeters: 10, timestamp: new Date().toISOString() },
    provider: { name: 'google', searchAhead: async () => candidates.map(c => ({ ...c, longitude: -90.1994, provider: 'google' as const, targetType: 'museum' as const, providerTypes: ['museum'] })) },
  });
  assert.ok(diagnostic.excludedCandidates.some(c => c.providerId === 'explicit-b' && c.reason === 'behind_user'), 'automatic heading filter remains unchanged');
  assert.equal(sessionDiscoveryCandidate(session.id, 'explicit-b')?.isAhead, false, 'explicit eligibility must not falsify direction');
  assert.ok(sessionDiscoveryCandidate(session.id, 'explicit-b'), 'known explicit candidate deliberately bypasses heading');
  const originalFetch = globalThis.fetch, originalGenerate = narrativeGenerator.generate;
  const calls: NarrativeGenerationRequest[] = [];
  let holdA = true, entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = async (url, options) => {
    if (!String(url).includes('wikipedia.org')) return originalFetch(url, options);
    const name = new URL(String(url)).searchParams.get('titles') ?? '';
    const latitude = name === 'Distant Museum' ? 38.7125 : 38.62;
    return new Response(JSON.stringify({ query: { pages: name.includes('Unknown') || !name ? {} : {
      '1': { pageid: 1, title: name, coordinates: [{ lat: latitude, lon: -90.1994 }], extract: fixture().brief.evidence.items.map(item => item.claim).join(' ') },
    } } }));
  };
  narrativeGenerator.generate = async request => {
    calls.push(request);
    if (holdA && request.plan.poiId === 'explicit-a') { entered(); await gate; }
    return { text: 'A verified historical story.', providerId: 'fixture', cached: false };
  };
  const listener = createApp().listen(0);
  try {
    const first = selectStory(session.id, owner, 'explicit-a', 'short', 'en', 'double-tap');
    const same = selectStory(session.id, owner, 'explicit-a', 'short', 'en', 'double-tap');
    assert.equal(first, same, 'retry shares the same pipeline, not a new charge');
    await started;
    assert.equal(calls.length, 1);
    const during = await pingSession(session.id, 38.627, -90.1994, 0, 112.65408, Date.now());
    assert.equal(during.nextAction, 'NONE', 'automatic ping cannot interrupt explicit preparation');
    const b = await selectStory(session.id, owner, 'explicit-b', 'short', 'en', 'new-choice');
    assert.equal(b.poiId, 'explicit-b');
    assert.equal(session.journeyState.getActiveMoment()?.entityId, 'explicit-b');
    release();
    await assert.rejects(first, error => (error as Error).name === 'AbortError');
    assert.equal(session.journeyState.getActiveMoment()?.momentId, b.momentId);
    assert.ok(!session.journeyState.getSnapshot().recent.outcomes.some(outcome => outcome.entityId === 'explicit-a' && outcome.reason === 'completed'));
    holdA = false;
    const port = (listener.address() as AddressInfo).port;
    const post = async (id: string, body: object, guest = owner) => {
      const response = await originalFetch(`http://127.0.0.1:${port}/sessions/${id}/select`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hey-city-guest-id': guest }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() as { poiId?: string; guideId?: string; momentId?: string } };
    };
    const selected = await post(session.id, { poiId: 'explicit-a', level: 'short', language: 'en', clientRequestId: 'mobile-request' });
    assert.equal(selected.status, 200, 'canonical selection supports guest ownership without a parallel endpoint');
    assert.equal(selected.body.guideId, 'dana');
    const beforeRetry = calls.length;
    const retry = await post(session.id, { poiId: 'explicit-a', level: 'short', language: 'en', clientRequestId: 'mobile-request' });
    assert.equal(retry.body.momentId, selected.body.momentId); assert.equal(calls.length, beforeRetry);
    const plan = calls.at(-1)!;
    assert.ok(plan.plan.selectionContext!.distanceMeters > 9000, 'explicit request can bypass automatic timing');
    assert.ok(plan.plan.safety.vehicleSafe); assert.ok(plan.plan.targetDurationSec <= plan.plan.safety.maxDurationSec);
    assert.throws(() => validateStory('It is right in front of us.', plan.brief), /Forbidden/);
    assert.equal((await post(session.id, { poiId: 'explicit-a', clientRequestId: 'foreign-user' }, 'guest_foreign123_abcdefg')).status, 404);
    assert.equal((await post(session.id, { poiId: 'invented', clientRequestId: 'unknown-id' })).status, 404);
    assert.equal((await post(session.id, { poiId: 'explicit-weak', clientRequestId: 'no-evidence' })).status, 422);
    assert.equal(calls.length, beforeRetry, 'insufficient evidence never invokes narrative generation');
    assert.equal((await post(session.id, { poiId: 'explicit-b', clientRequestId: 'mobile-request' })).status, 409, 'idempotency key cannot be reused for another selection');
    let abortEntered!: () => void, releaseAborted!: () => void;
    const enteredAbort = new Promise<void>(resolve => { abortEntered = resolve; });
    const abortedGate = new Promise<void>(resolve => { releaseAborted = resolve; });
    narrativeGenerator.generate = async () => { abortEntered(); await abortedGate; return { text: 'Late unheard story.', providerId: 'fixture', cached: false }; };
    const cancellation = new AbortController();
    const abortedHttp = originalFetch(`http://127.0.0.1:${port}/sessions/${session.id}/select`, {
      method: 'POST', signal: cancellation.signal, headers: { 'content-type': 'application/json', 'x-hey-city-guest-id': owner },
      body: JSON.stringify({ poiId: 'explicit-a', level: 'short', language: 'en', clientRequestId: 'abort-http' }),
    });
    await enteredAbort;
    const requestSignal = session.storyRequest!.signal;
    const serverAborted = new Promise<void>(resolve => requestSignal.addEventListener('abort', () => resolve(), { once: true }));
    cancellation.abort();
    await assert.rejects(abortedHttp, error => (error as Error).name === 'AbortError');
    await serverAborted;
    releaseAborted();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(session.journeyState.getActiveMoment(), undefined, 'cancelled preparation creates no heard or completed moment');
    narrativeGenerator.generate = originalGenerate;
    const savedKey = openai.apiKey;
    const savedFetch = globalThis.fetch;
    try {
      openai.apiKey = 'fixture-only';
      globalThis.fetch = async (url, options) => String(url).includes('api.openai.com')
        ? new Response('fixture speech failure', { status: 503 }) : savedFetch(url, options);
      narrativeGenerator.generate = async request => { calls.push(request); return { text: 'A unique text-only explicit narration for the delivery ownership regression.', providerId: 'fixture', cached: false }; };
      const textOnly = await selectStory(session.id, owner, 'explicit-b', 'short', 'en', 'text-only');
      assert.equal(textOnly.audioUrl, '');
      assert.equal(session.alreadyListening, true, 'text-only explicit delivery remains owned until dismissed');
      const held = await pingSession(session.id, 38.627, -90.1994, 0, 112.65408, Date.now());
      assert.equal(held.nextAction, 'NONE');
      assert.equal(session.journeyState.getActiveMoment()?.momentId, textOnly.momentId);
      assert.ok(!session.journeyState.getSnapshot().recent.outcomes.some(outcome => outcome.momentId === textOnly.momentId && outcome.reason === 'completed'));
    } finally { openai.apiKey = savedKey; globalThis.fetch = savedFetch; }
    const beforeBudget = calls.length;
    openCircuit(owner);
    assert.equal((await post(session.id, { poiId: 'explicit-b', clientRequestId: 'budget-limited' })).status, 429);
    assert.equal(calls.length, beforeBudget, 'explicit path respects circuit budget');
    assert.ok(getSession(session.id));
    console.log('native explicit selection: guest HTTP, ownership, heading isolation, idempotency, supersession, evidence, vehicle safety and budgets passed');
  } finally {
    release(); globalThis.fetch = originalFetch; narrativeGenerator.generate = originalGenerate;
    stopSession(session.id); listener.closeAllConnections();
    await new Promise<void>(resolve => listener.close(() => resolve()));
  }
}
const deadline = setTimeout(() => { console.error('native explicit selection test timed out'); process.exit(1); }, 15000);
void run().then(() => clearTimeout(deadline), error => { clearTimeout(deadline); console.error(error); process.exitCode = 1; });
