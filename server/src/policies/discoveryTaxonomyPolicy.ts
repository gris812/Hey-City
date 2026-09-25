import type { AheadDiscoveryTargetType } from '@heycity/shared';

export interface DiscoveryProviderTypeRule {
  targetType: AheadDiscoveryTargetType;
  providerTypes: readonly string[];
}

/** Ordered precedence is production policy: first matching rule wins. */
const AHEAD_DISCOVERY_PROVIDER_TYPE_RULES: readonly DiscoveryProviderTypeRule[] = Object.freeze([
  { targetType: 'city', providerTypes: ['locality'] },
  { targetType: 'town', providerTypes: ['postal_town'] },
  { targetType: 'locality', providerTypes: ['sublocality', 'neighborhood'] },
  { targetType: 'region', providerTypes: ['administrative_area_level_1', 'administrative_area_level_2'] },
  { targetType: 'historical_landmark', providerTypes: ['historical_landmark'] },
  { targetType: 'cultural_landmark', providerTypes: ['cultural_landmark', 'tourist_attraction'] },
  { targetType: 'monument', providerTypes: ['monument'] },
  { targetType: 'museum', providerTypes: ['museum'] },
  { targetType: 'national_park', providerTypes: ['national_park'] },
  { targetType: 'state_park', providerTypes: ['state_park'] },
  { targetType: 'park', providerTypes: ['park'] },
  { targetType: 'natural_feature', providerTypes: ['natural_feature'] },
  { targetType: 'bridge', providerTypes: ['bridge'] },
  { targetType: 'visitor_center', providerTypes: ['visitor_center'] },
  { targetType: 'university', providerTypes: ['university'] },
]);

const AHEAD_DISCOVERY_FORBIDDEN_PROVIDER_TYPES: readonly string[] = Object.freeze([
  'store', 'shopping_mall', 'gas_station', 'restaurant', 'cafe', 'bar', 'meal_takeaway',
  'meal_delivery', 'lodging', 'supermarket', 'convenience_store', 'car_dealer', 'car_repair',
  'local_service', 'bank', 'atm', 'parking',
]);

/** Cultural significance overrides commercial/noise tags in the Ahead Discovery pipeline. */
const AHEAD_DISCOVERY_CULTURAL_EXCEPTION_TYPES: readonly string[] = Object.freeze([
  'museum', 'historical_landmark', 'cultural_landmark', 'monument', 'national_park',
]);

const LEGACY_NEARBY_ALLOWED_PROVIDER_TYPES: readonly string[] = Object.freeze([
  'tourist_attraction', 'museum', 'park', 'church', 'synagogue', 'hindu_temple', 'mosque',
  'art_gallery', 'stadium', 'university', 'city_hall', 'library',
]);

const LEGACY_NEARBY_FORBIDDEN_PROVIDER_TYPES: readonly string[] = Object.freeze([
  'gas_station', 'convenience_store', 'atm', 'parking', 'car_wash', 'bank', 'store',
]);

/** Modern provider taxonomy: cultural exceptions override accompanying noise tags. */
export const aheadDiscoveryTaxonomy = Object.freeze({
  providerTypeRules: AHEAD_DISCOVERY_PROVIDER_TYPE_RULES,
  forbiddenProviderTypes: AHEAD_DISCOVERY_FORBIDDEN_PROVIDER_TYPES,
  culturalExceptionTypes: AHEAD_DISCOVERY_CULTURAL_EXCEPTION_TYPES,
  precedence: 'first_matching_target_rule' as const,
  forbiddenRule: 'cultural_exception_then_forbidden' as const,
});

/** Legacy compatibility branch: any forbidden type rejects the place. */
export const legacyNearbyPlacesTaxonomy = Object.freeze({
  allowedProviderTypes: LEGACY_NEARBY_ALLOWED_PROVIDER_TYPES,
  forbiddenProviderTypes: LEGACY_NEARBY_FORBIDDEN_PROVIDER_TYPES,
  precedence: 'forbidden_first' as const,
});

/** Narrative targets are shared canonical types, currently defined by Ahead Discovery mapping. */
export const DISCOVERY_NARRATIVE_TARGET_CATEGORIES: readonly AheadDiscoveryTargetType[] = Object.freeze(
  aheadDiscoveryTaxonomy.providerTypeRules.map(rule => rule.targetType)
);

export function providerTargetType(providerTypes: readonly string[]): AheadDiscoveryTargetType | null {
  const hasDenied = providerTypes.some(type => aheadDiscoveryTaxonomy.forbiddenProviderTypes.includes(type));
  const hasCulturalException = providerTypes.some(type => aheadDiscoveryTaxonomy.culturalExceptionTypes.includes(type));
  if (hasDenied && !hasCulturalException) return null;
  for (const rule of aheadDiscoveryTaxonomy.providerTypeRules) {
    if (providerTypes.some(type => rule.providerTypes.includes(type))) return rule.targetType;
  }
  return null;
}

export function isLegacyNearbyTypeAllowed(providerTypes: readonly string[]): boolean {
  const hasAllowed = providerTypes.some(type => legacyNearbyPlacesTaxonomy.allowedProviderTypes.includes(type));
  const hasForbidden = providerTypes.some(type => legacyNearbyPlacesTaxonomy.forbiddenProviderTypes.includes(type));
  return hasAllowed && !hasForbidden;
}
