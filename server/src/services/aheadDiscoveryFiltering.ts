import type {
  AheadDiscoveryTargetType,
  CandidateFilterResult,
  DiscoveryCandidate,
} from './aheadDiscoveryTypes';

const denyTypes = new Set([
  'store',
  'shopping_mall',
  'gas_station',
  'restaurant',
  'cafe',
  'bar',
  'meal_takeaway',
  'meal_delivery',
  'lodging',
  'supermarket',
  'convenience_store',
  'car_dealer',
  'car_repair',
  'local_service',
  'bank',
  'atm',
  'parking',
]);

const typeMap: Array<{ targetType: AheadDiscoveryTargetType; googleTypes: string[] }> = [
  { targetType: 'city', googleTypes: ['locality'] },
  { targetType: 'town', googleTypes: ['postal_town'] },
  { targetType: 'locality', googleTypes: ['sublocality', 'neighborhood'] },
  { targetType: 'region', googleTypes: ['administrative_area_level_1', 'administrative_area_level_2'] },
  { targetType: 'historical_landmark', googleTypes: ['historical_landmark'] },
  { targetType: 'cultural_landmark', googleTypes: ['cultural_landmark', 'tourist_attraction'] },
  { targetType: 'monument', googleTypes: ['monument'] },
  { targetType: 'museum', googleTypes: ['museum'] },
  { targetType: 'national_park', googleTypes: ['national_park'] },
  { targetType: 'state_park', googleTypes: ['state_park'] },
  { targetType: 'park', googleTypes: ['park'] },
  { targetType: 'natural_feature', googleTypes: ['natural_feature'] },
  { targetType: 'bridge', googleTypes: ['bridge'] },
  { targetType: 'visitor_center', googleTypes: ['visitor_center'] },
  { targetType: 'university', googleTypes: ['university'] },
];

export function normalizeTargetType(providerTypes: string[]): AheadDiscoveryTargetType | null {
  if (providerTypes.some((type) => denyTypes.has(type))) return null;
  for (const item of typeMap) {
    if (providerTypes.some((type) => item.googleTypes.includes(type))) {
      return item.targetType;
    }
  }
  return null;
}

export function exclusionReason(candidate: DiscoveryCandidate): string | null {
  if (!candidate.isAhead) return 'behind_user';
  if (candidate.providerTypes.some((type) => denyTypes.has(type))) return 'excluded_commercial_type';
  if (!normalizeTargetType(candidate.providerTypes)) return 'ambiguous_or_not_allowed';
  return null;
}

export function filterAheadCandidates(candidates: DiscoveryCandidate[]): CandidateFilterResult {
  const included: DiscoveryCandidate[] = [];
  const excluded: CandidateFilterResult['excluded'] = [];
  const summary: Record<string, number> = {};

  for (const candidate of candidates) {
    const reason = exclusionReason(candidate);
    if (!reason) {
      included.push(candidate);
      continue;
    }
    summary[reason] = (summary[reason] ?? 0) + 1;
    excluded.push({
      providerId: candidate.providerId,
      name: candidate.name,
      providerTypes: candidate.providerTypes,
      reason,
      distanceMeters: candidate.distanceMeters,
      headingDeltaDegrees: candidate.headingDeltaDegrees,
    });
  }

  return { included, excluded, summary };
}
