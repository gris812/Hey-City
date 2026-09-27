import { conversation, googleMaps } from '../config';
import { conversationNearbyCacheKey, cacheGet, cacheSet } from './cache';
import { encodeGeohash } from './geo';
import { recordUsage } from './usage';
import type { ConversationNearbyProvider, NearbySearchRequest, NearbySearchResult } from '../conversation/tools/types';

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  formattedAddress?: string;
};

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(bLat - aLat), dLng = radians(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

function normalizeCategory(query: string): string {
  const value = query.trim().toLowerCase().replace(/[^a-zа-яё0-9_ -]/gi, '').slice(0, 80);
  if (!value) throw new Error('Conversation nearby category is required');
  return value;
}

/**
 * Places New Text Search for an explicit user request. It intentionally does not
 * import Discovery taxonomy, filtering, scoring, or ranking policy.
 */
export class GoogleConversationNearbyProvider implements ConversationNearbyProvider {
  async searchNearby(request: NearbySearchRequest, userId?: string, signal?: AbortSignal): Promise<NearbySearchResult[]> {
    if (!googleMaps.apiKey) throw new Error('missing_google_key');
    const queryCategory = normalizeCategory(request.queryCategory);
    const limit = Math.max(1, Math.min(request.limit, conversation.nearbySearchLimit, 20));
    const radiusMeters = Math.max(100, Math.min(request.radiusMeters, 50000));
    const key = conversationNearbyCacheKey(encodeGeohash(request.latitude, request.longitude, 7), queryCategory, radiusMeters, limit);
    const cached = await cacheGet<NearbySearchResult[]>(key);
    if (cached) return cached;

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleMaps.apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: queryCategory,
        maxResultCount: limit,
        locationBias: { circle: { center: { latitude: request.latitude, longitude: request.longitude }, radius: radiusMeters } },
      }),
    });
    await recordUsage({ userId, category: 'google_maps', operation: 'conversation_places_text_search', estimatedCostUsd: googleMaps.placesUsdPerThousand / 1000 });
    if (!response.ok) throw new Error(`conversation_places_http_${response.status}`);
    const payload = await response.json() as { places?: GooglePlace[] };
    const results = (payload.places ?? []).flatMap((place): NearbySearchResult[] => {
      const latitude = place.location?.latitude, longitude = place.location?.longitude, name = place.displayName?.text;
      if (!place.id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [{
        id: place.id, name: name.slice(0, 160), category: place.types?.[0]?.slice(0, 80),
        latitude: latitude!, longitude: longitude!, address: place.formattedAddress?.slice(0, 240),
        distanceMeters: distanceMeters(request.latitude, request.longitude, latitude!, longitude!),
      }];
    }).slice(0, limit);
    await cacheSet(key, results, conversation.nearbySearchCacheTtlSeconds);
    return results;
  }
}

