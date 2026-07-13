/**
 * Google Places API: Nearby Search only. Place Details only when POI selected for story.
 * All keys server-side. Budget: respect MAX_PLACES_CALLS_PER_MINUTE_PER_USER.
 */
import { googleMaps, placeTypes, poi, cacheTtl, placesRadius } from '../config';
import { cacheGet, cacheSet, nearbyCacheKey } from './cache';
import { encodeGeohash, headingBucket, speedBucket, pointAhead } from './geo';

export interface NearbyPlace {
  place_id: string;
  name: string;
  types: string[];
  rating?: number;
  user_ratings_total?: number;
  geometry: { location: { lat: number; lng: number } };
  vicinity?: string;
}

function filterPlace(p: NearbyPlace): boolean {
  const hasAllowed = p.types?.some((t) => placeTypes.allowed.includes(t));
  const hasForbidden = p.types?.some((t) => placeTypes.forbidden.includes(t));
  if (hasForbidden || !hasAllowed) return false;
  const rating = p.rating ?? 0;
  const total = p.user_ratings_total ?? 0;
  if (rating < poi.minRating && total < poi.minUserRatingsTotal) return false;
  return true;
}

function scorePlace(p: NearbyPlace, themeTags: string[]): number {
  let score = 0;
  if (p.rating) score += p.rating * 10;
  if (p.user_ratings_total) score += Math.min(p.user_ratings_total / 100, 50);
  return score;
}

export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  headingDeg: number,
  speedKmh: number,
  themeTags: string[],
  userId: string
): Promise<NearbyPlace[]> {
  const theme = themeTags.sort().join(',') || 'mixed';
  const geohash = encodeGeohash(lat, lng, 7);
  const hBucket = headingBucket(headingDeg);
  const sBucket = speedBucket(speedKmh);
  const cacheKey = nearbyCacheKey(geohash, hBucket, sBucket, theme);
  const cached = await cacheGet<NearbyPlace[]>(cacheKey);
  if (cached) return cached;

  const distanceM =
    speedKmh < 40 ? 800 : speedKmh < 80 ? 1500 : 2500;
  const { lat: latAhead, lng: lngAhead } = pointAhead(lat, lng, headingDeg, distanceM);
  const radius = placesRadius.aheadM;

  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  url.searchParams.set('key', googleMaps.apiKey);
  url.searchParams.set('location', `${latAhead},${lngAhead}`);
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('type', 'tourist_attraction');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Places API error: ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{
      place_id: string;
      name: string;
      types?: string[];
      rating?: number;
      user_ratings_total?: number;
      geometry?: { location?: { lat?: number; lng?: number } };
      vicinity?: string;
    }>;
    status?: string;
    error_message?: string;
  };

  if (data.status === 'REQUEST_DENIED' || data.status === 'OVER_QUERY_LIMIT') {
    throw new Error(data.error_message || data.status || 'Places error');
  }

  const list = (data.results || []).map((r) => ({
    place_id: r.place_id,
    name: r.name,
    types: r.types || [],
    rating: r.rating,
    user_ratings_total: r.user_ratings_total,
    geometry: {
      location: {
        lat: r.geometry?.location?.lat ?? 0,
        lng: r.geometry?.location?.lng ?? 0,
      },
    },
    vicinity: r.vicinity,
  }));

  const filtered = list.filter(filterPlace);
  const sorted = [...filtered].sort((a, b) => scorePlace(b, themeTags) - scorePlace(a, themeTags));

  await cacheSet(cacheKey, sorted, cacheTtl.nearbyPlacesSec);
  return sorted;
}
