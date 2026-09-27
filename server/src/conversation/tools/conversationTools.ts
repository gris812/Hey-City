import { conversation } from '../../config';
import type { JourneyContext } from '../../services/journeyContext';
import type { ConversationNearbyProvider, NearbySearchResult, MapHighlightAction, NavigationHandoffAction, ActiveStoryToolContext, BoundedStoryEvidence } from './types';

export function currentTarget(context?: ActiveStoryToolContext): { subjectId: string; subjectName: string } | null {
  return context ? { subjectId: context.subjectId, subjectName: context.subjectName } : null;
}

export function currentArea(journey: Pick<JourneyContext, 'area'>): Record<string, string> | null {
  const area = Object.fromEntries(Object.entries(journey.area).filter(([key, value]) => key !== 'source' && typeof value === 'string')) as Record<string, string>;
  return Object.keys(area).length ? area : null;
}

export function journeyRecall(journey: Pick<JourneyContext, 'recent'>): Array<{ entityId: string; name: string; category?: string; outcome?: string }> {
  return journey.recent.entities.slice(-conversation.maxRecallItems).reverse().map(entity => ({
    entityId: entity.entityId, name: entity.name, category: entity.category, outcome: entity.outcome,
  }));
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
  return provider.searchNearby({ ...request, radiusMeters: conversation.nearbySearchRadiusMeters, limit: conversation.nearbySearchLimit }, userId, signal);
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
