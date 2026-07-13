/**
 * Cache abstraction. MVP: in-memory; production: Redis (ioredis).
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memory = new Map<string, CacheEntry<unknown>>();

function getKey(prefix: string, parts: (string | number)[]): string {
  return [prefix, ...parts].join(':');
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const entry = memory.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

export async function cacheSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  memory.set(key, {
    value,
    expiresAt: Date.now() + ttlSec * 1000,
  });
}

// --- Key builders for spec ---

export function nearbyCacheKey(geohash: string, headingBucket: number, speedBucket: string, theme: string): string {
  return getKey('nearby', [geohash, headingBucket, speedBucket, theme]);
}

export function matrixCacheKey(originGeohash: string, destinationsHash: string, departureBucket: number): string {
  return getKey('matrix', [originGeohash, destinationsHash, departureBucket]);
}

export function placeDetailsCacheKey(placeId: string): string {
  return getKey('place', [placeId]);
}

export function storyTextCacheKey(poiId: string, lang: string, theme: string, style: string, lengthBucket: number): string {
  return getKey('story', [poiId, lang, theme, style, lengthBucket]);
}

export function ttsAudioCacheKey(storyHash: string, voiceId: string): string {
  return getKey('tts', [storyHash, voiceId]);
}
