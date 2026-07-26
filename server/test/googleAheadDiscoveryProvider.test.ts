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
  googleMaps.apiKey = 'test-key';
  googleMaps.placesNewFieldMask = 'places.id,places.displayName,places.location,places.types';
  global.fetch = (async (url: string, init?: RequestInit) => {
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

  global.fetch = (async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response) as typeof fetch;
  await assert.rejects(
    () =>
      googleAheadDiscoveryProvider.searchAhead({
        movement,
        projectedPoint: { latitude: 39.9, longitude: -89.65 },
        radiusMeters: 12000,
        limit: 10,
      }),
    /quota_or_rate_limit/,
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
