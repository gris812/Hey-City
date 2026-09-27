import { conversation } from '../../config';
import type { JourneyContext } from '../../services/journeyContext';
import type { ConversationNearbyProvider, NearbySearchRequest, NearbySearchResult, MapHighlightAction, NavigationHandoffAction, ActiveStoryToolContext, BoundedStoryEvidence, JourneyRecallItem } from './types';

export function currentTarget(context?: ActiveStoryToolContext): { subjectId: string; subjectName: string } | null {
  return context ? { subjectId: context.subjectId, subjectName: context.subjectName } : null;
}

export function currentArea(journey: Pick<JourneyContext, 'area'>): Record<string, string> | null {
  const area = Object.fromEntries(Object.entries(journey.area).filter(([key, value]) => key !== 'source' && typeof value === 'string')) as Record<string, string>;
  return Object.keys(area).length ? area : null;
}

export function journeyRecall(journey: Pick<JourneyContext, 'recent'>): JourneyRecallItem[] {
  return journey.recent.entities.slice(-conversation.maxRecallItems).reverse().map(entity => ({
    entityId: entity.entityId, name: entity.name, category: entity.category, outcome: entity.outcome,
  }));
}

/** Strict category accepted at the model/service/provider boundary. */
export function normalizeConversationQueryCategory(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N}_ -]*$/u.test(normalized)) return null;
  return normalized;
}

/** Enforces the explicit conversation-search radius independently of provider bias/order. */
export function boundConversationNearbyResults(
  request: Pick<NearbySearchRequest, 'latitude' | 'longitude' | 'radiusMeters' | 'limit'>,
  results: readonly NearbySearchResult[],
): NearbySearchResult[] {
  return results.flatMap((result): NearbySearchResult[] => {
    if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return [];
    const boundedDistance = distanceMeters(request.latitude, request.longitude, result.latitude, result.longitude);
    return boundedDistance <= request.radiusMeters ? [{ ...result, distanceMeters: boundedDistance }] : [];
  }).sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, request.limit));
}

export function storyEvidence(context?: ActiveStoryToolContext): BoundedStoryEvidence[] {
  return (context?.evidence ?? []).slice(0, conversation.maxEvidenceItems).map(item => ({
    ...(item.ref ? { ref: item.ref.slice(0, 120) } : {}), text: item.text.slice(0, 600),
  }));
}

export async function nearbySearch(
  provider: ConversationNearbyProvider,
  request: { queryCategory: string; latitude: number; longitude: number },
  userId?: string,
  signal?: AbortSignal
): Promise<NearbySearchResult[]> {
  const boundedRequest = { ...request, radiusMeters: conversation.nearbySearchRadiusMeters, limit: conversation.nearbySearchLimit };
  const results = await provider.searchNearby(boundedRequest, userId, signal);
  return boundConversationNearbyResults(boundedRequest, results);
}

export function mapHighlight(results: NearbySearchResult[]): MapHighlightAction | null {
  if (!results.length) return null;
  return { type: 'highlight_places', places: results.slice(0, conversation.nearbySearchLimit).map(({ id, name, latitude, longitude }) => ({ id, label: name, latitude, longitude })) };
}

/** Only a result returned by a validated tool can become a destination. */
export function navigationHandoff(destinationId: string, validated: NearbySearchResult[]): NavigationHandoffAction | null {
  const destination = validated.find(place => place.id === destinationId);
  return destination ? { type: 'navigation_handoff', destination: {
    id: destination.id, name: destination.name, latitude: destination.latitude, longitude: destination.longitude,
  } } : null;
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(bLat - aLat), dLng = radians(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}
