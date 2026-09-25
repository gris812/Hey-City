import type { AheadDiscoveryTargetType } from '@heycity/shared';

export const DISCOVERY_CATEGORY_PRIORITY: Readonly<Record<AheadDiscoveryTargetType, number>> = Object.freeze({
  city: 1,
  town: 1,
  locality: 1,
  region: 2,
  national_park: 2,
  natural_feature: 2,
  historical_landmark: 3,
  cultural_landmark: 3,
  state_park: 4,
  bridge: 4,
  monument: 5,
  visitor_center: 5,
  museum: 6,
  university: 6,
  park: 7,
  other_significant_place: 8,
});

export const DISCOVERY_POPULARITY_POLICY = Object.freeze({
  ratingMaximum: 5,
  ratingWeight: 0.35,
  ratingCountCap: 5000,
  ratingCountWeight: 0.65,
});

export const DISCOVERY_CATEGORY_PRIORITY_FALLBACK = 8;
export const DISCOVERY_CATEGORY_PRIORITY_RANGE = 7;
