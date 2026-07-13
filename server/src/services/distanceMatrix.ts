/**
 * Distance Matrix API: ETA for top K destinations only. Cached.
 */
import { googleMaps, poi, cacheTtl } from '../config';
import { cacheGet, cacheSet, matrixCacheKey } from './cache';
import { encodeGeohash, departureBucket } from './geo';

export interface MatrixResult {
  placeId: string;
  durationSec: number;
  distanceM?: number;
}

function hashDestinations(places: Array<{ place_id: string }>): string {
  return places
    .map((p) => p.place_id)
    .sort()
    .join('|');
}

export async function getEtas(
  originLat: number,
  originLng: number,
  destinations: Array<{ place_id: string; lat: number; lng: number }>,
  userId: string
): Promise<MatrixResult[]> {
  const K = Math.min(poi.kDestinations, destinations.length);
  const dest = destinations.slice(0, K);

  const originGeohash = encodeGeohash(originLat, originLng, 7);
  const destHash = hashDestinations(dest);
  const depBucket = departureBucket();
  const cacheKey = matrixCacheKey(originGeohash, destHash, depBucket);
  const cached = await cacheGet<MatrixResult[]>(cacheKey);
  if (cached) return cached;

  const origins = `${originLat},${originLng}`;
  const destStr = dest.map((d) => `${d.lat},${d.lng}`).join('|');

  const params = new URLSearchParams({
    key: googleMaps.apiKey,
    origins,
    destinations: destStr,
    mode: 'driving',
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`);
  if (!res.ok) throw new Error(`Matrix API error: ${res.status}`);

  const data = (await res.json()) as {
    rows?: Array<{
      elements?: Array<{
        status?: string;
        duration?: { value: number };
        distance?: { value: number };
      }>;
    }>;
    status?: string;
    error_message?: string;
  };

  if (data.status === 'REQUEST_DENIED' || data.status === 'OVER_QUERY_LIMIT') {
    throw new Error(data.error_message || data.status || 'Matrix error');
  }

  const elements = data.rows?.[0]?.elements ?? [];
  const results: MatrixResult[] = dest.map((d, i) => {
    const el = elements[i];
    const durationSec = el?.status === 'OK' && el.duration ? el.duration.value : 999999;
    const distanceM = el?.status === 'OK' && el.distance ? el.distance.value : undefined;
    return { placeId: d.place_id, durationSec, distanceM };
  });

  await cacheSet(cacheKey, results, cacheTtl.matrixSec);
  return results;
}
