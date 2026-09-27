import assert from 'node:assert/strict';
import { ConversationIntentResolver, parseConversationIntentOutput } from '../src/services/conversationIntentResolver';
import { ConversationAnswerGenerator } from '../src/services/conversationAnswerGenerator';
import { mapHighlight, navigationHandoff, storyEvidence } from '../src/conversation/tools/conversationTools';
import { sanitizeConversationTelemetryEvent } from '../src/services/usage';
import type { GenerativeTaskRequest, GenerativeTaskResult } from '../src/ai/generativeProvider';
import { GoogleConversationNearbyProvider } from '../src/services/googleConversationNearbyProvider';
import { googleMaps } from '../src/config';

const results = [{ id: 'cafe-1', name: 'Grounded Cafe', category: 'cafe', latitude: 40.7, longitude: -74, address: '1 Main St', distanceMeters: 90 }];

async function run(): Promise<void> {
  const resolver = new ConversationIntentResolver();
  assert.deepEqual(await resolver.resolve({ text: 'Где рядом кофе?' }), { intent: 'nearby_search', queryCategory: 'coffee shop', deterministic: true });
  assert.equal((await resolver.resolve({ text: 'Stop the story.' })).intent, 'stop_story');
  assert.equal((await resolver.resolve({ text: 'Why is that important?' })).intent, 'ask_about_current_story');
  assert.equal(parseConversationIntentOutput('{"intent":"nearby_search"}'), 'nearby_search');
  assert.equal(parseConversationIntentOutput('{"intent":"arbitrary_provider_call"}'), null);
  assert.equal(parseConversationIntentOutput('nearby_search'), null);

  assert.deepEqual(mapHighlight(results), { type: 'highlight_places', places: [{ id: 'cafe-1', label: 'Grounded Cafe', latitude: 40.7, longitude: -74 }] });
  assert.equal(navigationHandoff('not-a-result', results), null);
  assert.equal(navigationHandoff('cafe-1', results)?.destination.name, 'Grounded Cafe');
  assert.deepEqual(storyEvidence({ subjectId: 'federal-hall', subjectName: 'Federal Hall', evidence: [{ ref: 'a', text: 'Validated evidence' }] }), [{ ref: 'a', text: 'Validated evidence' }]);

  const calls: GenerativeTaskRequest[] = [];
  const router = { generate: async (request: GenerativeTaskRequest): Promise<GenerativeTaskResult> => {
    calls.push(request); return { text: 'A grounded answer.', providerId: 'test', model: 'test' };
  } };
  const generator = new ConversationAnswerGenerator(router);
  assert.match(await generator.generate({ intent: 'nearby_search', guideId: 'dana', language: 'en', nearbyResults: results }), /Grounded Cafe/);
  assert.equal(calls.length, 0, 'validated nearby results have a deterministic spoken answer');
  await generator.generate({ intent: 'ask_about_current_story', guideId: 'arthur', language: 'en', subject: { id: 'federal-hall', name: 'Federal Hall' }, evidence: [{ text: 'Validated evidence only.' }] });
  assert.equal(calls.length, 1);
  assert.match(calls[0].input, /Validated evidence only/);
  assert.doesNotMatch(calls[0].instructions, /provider call/i);

  const telemetry = sanitizeConversationTelemetryEvent({
    sessionId: 'session-1', intent: 'nearby_search', tool: 'NearbySearch', success: true,
    latencyBucket: 'under_250ms', resultCountBucket: 'one',
    // Extra unsafe fields must not be accepted or persisted.
    ...( { text: 'secret question', latitude: 40.7, providerPayload: { raw: true }, evidence: 'claim' } as object ),
  } as never);
  assert.deepEqual(telemetry, { sessionId: 'session-1', intent: 'nearby_search', tool: 'NearbySearch', success: true,
    latencyBucket: 'under_250ms', resultCountBucket: 'one' });

  const savedFetch = globalThis.fetch, savedGoogleKey = googleMaps.apiKey;
  googleMaps.apiKey = 'test-key';
  try {
    let requestUrl = '', requestBody = '', fieldMask = '';
    globalThis.fetch = async (url, init) => {
      requestUrl = String(url); requestBody = String(init?.body); fieldMask = String((init?.headers as Record<string, string>)['X-Goog-FieldMask']);
      return new Response(JSON.stringify({ places: [{ id: 'commercial-cafe', displayName: { text: 'Cafe Allowed Here' }, location: { latitude: 40.701, longitude: -74.001 }, types: ['cafe'], formattedAddress: '2 Main St' }] }));
    };
    const providerResults = await new GoogleConversationNearbyProvider().searchNearby({ queryCategory: 'coffee shop', latitude: 40.7, longitude: -74, radiusMeters: 500, limit: 2 });
    assert.match(requestUrl, /places:searchText/);
    assert.match(requestBody, /coffee shop/);
    assert.match(fieldMask, /formattedAddress/);
    assert.equal(providerResults[0].name, 'Cafe Allowed Here', 'explicit conversation nearby search does not apply Discovery commercial filtering');
  } finally { globalThis.fetch = savedFetch; googleMaps.apiKey = savedGoogleKey; }
  console.log('conversation building block tests passed');
}

void run();
