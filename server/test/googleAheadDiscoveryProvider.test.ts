import assert from 'node:assert/strict';
import { googleMaps } from '../src/config';
import { googleAheadDiscoveryProvider } from '../src/services/googleAheadDiscoveryProvider';
import type { MovementContext } from '@heycity/shared';

const originalFetch = global.fetch;
const originalKey = googleMaps.apiKey;
const originalMask = googleMaps.placesNewFieldMask;

const movement: MovementContext = {
  latitude: 39.7817,
  longitude: -89.6501,
  headingDegrees: 0,
  speedMps: 22,
  accuracyMeters: 10,
  timestamp: '2026-07-25T12:00:00.000Z',
};

async function run() {
  googleMaps.apiKey = '';
  await assert.rejects(
    () =>
      googleAheadDiscoveryProvider.searchAhead({
        movement,
        projectedPoint: { latitude: 39.9, longitude: -89.65 },
        radiusMeters: 12000,
        limit: 10,
      }),
    /missing_google_key/,
    'missing Google key returns provider error'
  );

  const seenMasks: string[] = [];
  let fetchCalls = 0;
  googleMaps.apiKey = 'test-key';
  googleMaps.placesNewFieldMask = 'places.id,places.displayName,places.location,places.types';
  global.fetch = (async (url: string, init?: RequestInit) => {
    fetchCalls += 1;
    if (url.includes('geocode')) {
      return {
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            {
              place_id: 'settlement-1',
              formatted_address: 'Springfield, Illinois',
              types: ['locality'],
              geometry: { location: { lat: 39.8, lng: -89.6 } },
            },
          ],
        }),
      } as Response;
    }
    seenMasks.push(String(init?.headers && (init.headers as Record<string, string>)['X-Goog-FieldMask']));
    return {
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'place-1',
            displayName: { text: 'Lincoln Home National Historic Site' },
            location: { latitude: 39.797, longitude: -89.648 },
            types: ['historical_landmark', 'tourist_attraction'],
            rating: 4.8,
            userRatingCount: 1200,
          },
          {
            id: 'bad-1',
            displayName: { text: 'Malformed' },
            types: ['museum'],
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  const candidates = await googleAheadDiscoveryProvider.searchAhead({
    movement,
    projectedPoint: { latitude: 39.9, longitude: -89.65 },
    radiusMeters: 12000,
    limit: 10,
  });
  assert(candidates.some((candidate) => candidate.providerId === 'settlement-1'), 'geocode locality normalizes');
  assert(candidates.some((candidate) => candidate.providerId === 'place-1'), 'Places New result normalizes');
  assert(!candidates.some((candidate) => candidate.providerId === 'bad-1'), 'malformed result is skipped safely');
  assert.equal(seenMasks[0], googleMaps.placesNewFieldMask, 'Places New minimal field mask is sent');
  assert.equal(fetchCalls, 2, 'first discovery performs one geocode and one Nearby Search request');

  const cachedCandidates = await googleAheadDiscoveryProvider.searchAhead({
    movement,
    projectedPoint: { latitude: 39.9, longitude: -89.65 },
    radiusMeters: 12000,
    limit: 10,
  });
  assert.equal(fetchCalls, 2, 'same geo cell is served from shared provider cache');
  assert.deepEqual(cachedCandidates, candidates, 'cached discovery preserves provider result');

  let areaCalls = 0;
  let placeCalls = 0;
  global.fetch = (async (url: string) => {
    if (url.includes('geocode')) { areaCalls++; return { ok: true, json: async () => ({ status: 'ZERO_RESULTS', results: [] }) } as Response; }
    placeCalls++; return { ok: false, status: 500 } as Response;
  }) as typeof fetch;
  const failedInput = { movement, projectedPoint: { latitude: 41.1, longitude: -87.1 }, radiusMeters: 12000, limit: 10 };
  await Promise.allSettled([
    googleAheadDiscoveryProvider.searchAhead(failedInput),
    googleAheadDiscoveryProvider.searchAhead(failedInput),
  ]);
  assert.equal(areaCalls, 1, 'concurrent area requests are deduplicated');
  assert.equal(placeCalls, 1, 'concurrent Places requests are deduplicated');
  await assert.rejects(() => googleAheadDiscoveryProvider.searchAhead(failedInput), /http_500/);
  assert.equal(areaCalls, 1, 'successful empty area survives Places failure');
  assert.equal(placeCalls, 1, 'failed requests respect backoff');
  await assert.rejects(() => googleAheadDiscoveryProvider.searchAhead({ ...failedInput, limit: 11 }), /http_500/);
  assert.equal(areaCalls, 1, 'area cache independent of Places limit');

  let deniedCalls = 0;
  global.fetch = (async (url: string) => {
    if (url.includes('geocode')) { deniedCalls++; return { ok: true, json: async () => ({ status: 'REQUEST_DENIED' }) } as Response; }
    return { ok: true, json: async () => ({ places: [] }) } as Response;
  }) as typeof fetch;
  await assert.rejects(() => googleAheadDiscoveryProvider.searchAhead({ ...failedInput, projectedPoint: { latitude: 42, longitude: -86 } }), /REQUEST_DENIED/);
  await assert.rejects(() => googleAheadDiscoveryProvider.searchAhead({ ...failedInput, projectedPoint: { latitude: 43, longitude: -85 } }), /REQUEST_DENIED/);
  assert.equal(deniedCalls, 1, 'access failure blocks area requests across cells');

  global.fetch = (async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response) as typeof fetch;
  await assert.rejects(
    () =>
      googleAheadDiscoveryProvider.searchAhead({
        movement,
        projectedPoint: { latitude: 40.9, longitude: -88.65 },
        radiusMeters: 12000,
        limit: 10,
      }),
    /REQUEST_DENIED|quota_or_rate_limit/,
    'quota response becomes safe provider error'
  );
}

run()
  .finally(() => {
    global.fetch = originalFetch;
    googleMaps.apiKey = originalKey;
    googleMaps.placesNewFieldMask = originalMask;
  })
  .then(() => console.log('googleAheadDiscoveryProvider tests passed'));
