import { aheadDiscovery, googleMaps } from '../config';
import type {
  DiscoveryDataProvider,
  ProviderDiscoveryCandidate,
  SearchAheadInput,
} from './aheadDiscoveryTypes';
import { normalizeTargetType } from './aheadDiscoveryFiltering';
import { aheadDiscoveryCacheKey, cacheGet, cacheSet } from './cache';
import { encodeGeohash } from './geo';
import { recordUsage } from './usage';

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
};

const pending = new Map<string, Promise<ProviderDiscoveryCandidate[]>>();

// Separate operation caches preserve a successful area lookup when Places fails.
async function cachedOperation(key: string, operation: string, ttl: number,
  request: () => Promise<ProviderDiscoveryCandidate[]>): Promise<ProviderDiscoveryCandidate[]> {
  const cached = await cacheGet<ProviderDiscoveryCandidate[]>(key);
  if (cached) return cached;
  const blocked = await cacheGet<string>(`blocked:${operation}`);
  const failed = await cacheGet<string>(`failed:${key}`);
  if (blocked || failed) throw safeProviderError(blocked || failed!);
  const existing = pending.get(key);
  if (existing) return existing;
  const task = (async () => {
    await recordUsage({ category: 'product', operation: `${operation}_attempt` });
    try {
      const result = await request();
      await cacheSet(key, result, ttl);
      return result;
    } catch (error) {
      const code = (error as Error).message;
      await cacheSet(`failed:${key}`, code, aheadDiscovery.providerErrorBackoffSeconds);
      if (/http_40[13]|REQUEST_DENIED|quota_or_rate_limit/.test(code)) {
        await cacheSet(`blocked:${operation}`, code, aheadDiscovery.providerErrorBackoffSeconds);
      }
      await recordUsage({ category: 'product', operation: `${operation}_error`, metadata: { code } });
      throw error;
    }
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

type GoogleGeocodeResult = {
  place_id?: string;
  formatted_address?: string;
  types?: string[];
  geometry?: { location?: { lat?: number; lng?: number } };
};

function safeProviderError(code: string): Error {
  const err = new Error(code);
  err.name = 'AheadDiscoveryProviderError';
  return err;
}

function toCandidate(input: {
  providerId?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  providerTypes?: string[];
  rating?: number;
  userRatingCount?: number;
}): ProviderDiscoveryCandidate | null {
  if (
    !input.providerId ||
    !input.name ||
    typeof input.latitude !== 'number' ||
    typeof input.longitude !== 'number'
  ) {
    return null;
  }
  const providerTypes = input.providerTypes ?? [];
  const targetType = normalizeTargetType(providerTypes) ?? 'other_significant_place';
  return {
    providerId: input.providerId,
    provider: 'google',
    name: input.name,
    targetType,
    latitude: input.latitude,
    longitude: input.longitude,
    rating: input.rating,
    userRatingCount: input.userRatingCount,
    providerTypes,
  };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aheadDiscovery.providerTimeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      if (res.status === 429) throw safeProviderError('quota_or_rate_limit');
      throw safeProviderError(`http_${res.status}`);
    }
    return res.json();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw safeProviderError('timeout');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export const googleAheadDiscoveryProvider: DiscoveryDataProvider = {
  name: 'google',
  async searchAhead(input: SearchAheadInput): Promise<ProviderDiscoveryCandidate[]> {
    if (!googleMaps.apiKey) throw safeProviderError('missing_google_key');

    const geohash = encodeGeohash(
      input.projectedPoint.latitude,
      input.projectedPoint.longitude,
      7
    );
    const cacheKey = aheadDiscoveryCacheKey(geohash, input.radiusMeters, input.limit);
    const cached = await cacheGet<ProviderDiscoveryCandidate[]>(cacheKey);
    if (cached) return cached;

    const [settlements, places] = await Promise.all([
      cachedOperation(`area:${encodeGeohash(input.projectedPoint.latitude, input.projectedPoint.longitude, aheadDiscovery.areaCachePrecision)}`,
        'reverse_geocoding', aheadDiscovery.areaCacheTtlSeconds, () => searchGeocodedSettlements(input)),
      cachedOperation(`places:${cacheKey}`, 'places_nearby_new', aheadDiscovery.providerCacheTtlSeconds,
        () => searchPlacesNew(input)),
    ]);

    const byId = new Map<string, ProviderDiscoveryCandidate>();
    for (const candidate of [...settlements, ...places]) {
      byId.set(candidate.providerId, candidate);
    }
    const results = [...byId.values()].slice(0, input.limit);
    await cacheSet(cacheKey, results, aheadDiscovery.providerCacheTtlSeconds);
    return results;
  },
};

async function searchGeocodedSettlements(
  input: SearchAheadInput
): Promise<ProviderDiscoveryCandidate[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('key', googleMaps.apiKey);
  url.searchParams.set(
    'latlng',
    `${input.projectedPoint.latitude},${input.projectedPoint.longitude}`
  );
  url.searchParams.set('result_type', 'locality|administrative_area_level_2|administrative_area_level_1');

  const data = (await fetchJson(url.toString())) as {
    status?: string;
    results?: GoogleGeocodeResult[];
  };
  if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw safeProviderError(data.status === 'OVER_QUERY_LIMIT' ? 'quota_or_rate_limit' : `geocode_${data.status}`);
  }
  await recordUsage({ category: 'google_maps', operation: 'reverse_geocoding', estimatedCostUsd: googleMaps.geocodingUsdPerThousand / 1000, metadata: { status: data.status } });

  return (data.results ?? [])
    .map((result) =>
      toCandidate({
        providerId: result.place_id,
        name: result.formatted_address,
        latitude: result.geometry?.location?.lat,
        longitude: result.geometry?.location?.lng,
        providerTypes: result.types,
      })
    )
    .filter((candidate): candidate is ProviderDiscoveryCandidate => Boolean(candidate));
}

async function searchPlacesNew(input: SearchAheadInput): Promise<ProviderDiscoveryCandidate[]> {
  const body = {
    includedTypes: [
      'historical_landmark',
      'cultural_landmark',
      'tourist_attraction',
      'museum',
      'national_park',
      'park',
      'visitor_center',
      'university',
    ],
    maxResultCount: Math.min(input.limit, 20),
    locationRestriction: {
      circle: {
        center: {
          latitude: input.projectedPoint.latitude,
          longitude: input.projectedPoint.longitude,
        },
        radius: Math.min(input.radiusMeters, 50000),
      },
    },
  };

  const data = (await fetchJson('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleMaps.apiKey,
      'X-Goog-FieldMask': googleMaps.placesNewFieldMask,
    },
    body: JSON.stringify(body),
  })) as { places?: GooglePlace[] };
  await recordUsage({ category: 'google_maps', operation: 'places_nearby_new', estimatedCostUsd: googleMaps.placesUsdPerThousand / 1000 });

  return (data.places ?? [])
    .map((place) =>
      toCandidate({
        providerId: place.id,
        name: place.displayName?.text,
        latitude: place.location?.latitude,
        longitude: place.location?.longitude,
        providerTypes: place.types,
      })
    )
    .filter((candidate): candidate is ProviderDiscoveryCandidate => Boolean(candidate));
}
