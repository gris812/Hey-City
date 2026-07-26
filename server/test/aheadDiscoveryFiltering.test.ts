import assert from 'node:assert/strict';
import { filterAheadCandidates, normalizeTargetType } from '../src/services/aheadDiscoveryFiltering';
import type { DiscoveryCandidate } from '@heycity/shared';

function candidate(types: string[], isAhead = true): DiscoveryCandidate {
  return {
    providerId: types.join('-') || 'unknown',
    provider: 'google',
    name: types.join(' ') || 'Unknown',
    targetType: normalizeTargetType(types) ?? 'other_significant_place',
    latitude: 40,
    longitude: -90,
    distanceMeters: 2000,
    bearingDegrees: 0,
    headingDeltaDegrees: isAhead ? 5 : 180,
    isAhead,
    providerTypes: types,
  };
}

for (const excludedTypes of [
  ['restaurant'],
  ['gas_station'],
  ['store'],
  ['local_service'],
]) {
  const result = filterAheadCandidates([candidate(excludedTypes)]);
  assert.equal(result.included.length, 0, `${excludedTypes[0]} is excluded`);
}

for (const allowedTypes of [
  ['historical_landmark'],
  ['locality'],
  ['national_park'],
]) {
  const result = filterAheadCandidates([candidate(allowedTypes)]);
  assert.equal(result.included.length, 1, `${allowedTypes[0]} is included`);
}

const unknown = filterAheadCandidates([candidate(['point_of_interest'])]);
assert.equal(unknown.included.length, 0, 'unknown ambiguous type is excluded');
assert.equal(unknown.excluded[0].reason, 'ambiguous_or_not_allowed');

const behind = filterAheadCandidates([candidate(['historical_landmark'], false)]);
assert.equal(behind.included.length, 0, 'behind target is excluded regardless of category');
assert.equal(behind.excluded[0].reason, 'behind_user');

console.log('aheadDiscoveryFiltering tests passed');
