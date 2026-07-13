import fs from 'node:fs';
import path from 'node:path';
import { poi } from '../config';
import { DiscoveryCandidate } from './driveDecision';
import { distanceMeters } from './geo';
import { NearbyPlace } from './googlePlaces';

interface SeedPoi {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number };
  type: string;
  importanceScore: number;
  tags: string[];
  storySeed: string;
}

const seedPath = path.resolve(
  process.cwd(),
  '../data/poi/NYC Financial District - POI Pack.json'
);
const seedPois = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as SeedPoi[];

export function getLocalPoiById(poiId: string): SeedPoi | null {
  return seedPois.find((seed) => seed.id === poiId) ?? null;
}

export function findLocalPoiCandidates(input: {
  lat: number;
  lng: number;
  speedKmh: number;
  themeTags: string[];
  limit?: number;
}): DiscoveryCandidate[] {
  const speedMps = Math.max(input.speedKmh / 3.6, 1);
  const themes = new Set(input.themeTags);

  return seedPois
    .map((seed) => {
      const distance = Math.round(
        distanceMeters(input.lat, input.lng, seed.coordinates.lat, seed.coordinates.lng)
      );
      const themeScore = seed.tags.some((tag) => themes.has(tag)) ? 5 : 0;
      const proximityScore = Math.max(0, 12 - distance / 100);
      const score = seed.importanceScore + themeScore + proximityScore;

      return {
        poiId: seed.id,
        placeName: seed.name,
        distanceMeters: distance,
        etaSeconds: Math.round(distance / speedMps),
        storySeed: seed.storySeed,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? poi.kDestinations)
    .map(({ score: _score, ...candidate }) => candidate);
}

export function localCandidateToNearbyPlace(candidate: DiscoveryCandidate): NearbyPlace {
  const seed = getLocalPoiById(candidate.poiId);
  return {
    place_id: candidate.poiId,
    name: candidate.placeName,
    types: seed?.tags ?? [],
    rating: undefined,
    user_ratings_total: undefined,
    geometry: {
      location: {
        lat: seed?.coordinates.lat ?? 0,
        lng: seed?.coordinates.lng ?? 0,
      },
    },
    vicinity: 'NYC Financial District seed',
  };
}
