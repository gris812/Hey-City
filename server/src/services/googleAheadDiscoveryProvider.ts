import { aheadDiscovery, googleMaps } from '../config';
import type {
  DiscoveryDataProvider,
  ProviderDiscoveryCandidate,
  SearchAheadInput,
} from './aheadDiscoveryTypes';
import { normalizeTargetType } from './aheadDiscoveryFiltering';

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
};

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

    const [settlements, places] = await Promise.all([
      searchGeocodedSettlements(input),
      searchPlacesNew(input),
    ]);

    const byId = new Map<string, ProviderDiscoveryCandidate>();
    for (const candidate of [...settlements, ...places]) {
      byId.set(candidate.providerId, candidate);
    }
    return [...byId.values()].slice(0, input.limit);
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
    throw safeProviderError(data.status === 'OVER_QUERY_LIMIT' ? 'quota_or_rate_limit' : 'geocode_error');
  }

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

  return (data.places ?? [])
    .map((place) =>
      toCandidate({
        providerId: place.id,
        name: place.displayName?.text,
        latitude: place.location?.latitude,
        longitude: place.location?.longitude,
        providerTypes: place.types,
        rating: place.rating,
        userRatingCount: place.userRatingCount,
      })
    )
    .filter((candidate): candidate is ProviderDiscoveryCandidate => Boolean(candidate));
}
