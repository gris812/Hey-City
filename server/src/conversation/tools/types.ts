import type { ConversationToolName, MapAction, NavigationAction } from '@heycity/shared';

/** Provider-independent, bounded conversation tool contracts. Raw provider payloads never leave this layer. */
export type { ConversationToolName } from '@heycity/shared';

export interface NearbySearchRequest {
  queryCategory: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit: number;
}

export interface NearbySearchResult {
  id: string;
  name: string;
  category?: string;
  latitude: number;
  longitude: number;
  distanceMeters?: number;
  address?: string;
}

export interface ConversationNearbyProvider {
  searchNearby(request: NearbySearchRequest, userId?: string, signal?: AbortSignal): Promise<NearbySearchResult[]>;
}

export type MapHighlightAction = MapAction;

export type NavigationHandoffAction = NavigationAction;

export interface BoundedStoryEvidence {
  ref?: string;
  text: string;
}

export interface ActiveStoryToolContext {
  subjectId: string;
  subjectName: string;
  evidence?: BoundedStoryEvidence[];
}
