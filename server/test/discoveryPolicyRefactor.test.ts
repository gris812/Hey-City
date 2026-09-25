import assert from 'node:assert/strict';
import type { AheadDiscoveryTargetType, DiscoveryCandidate } from '@heycity/shared';
import {
  DISCOVERY_NARRATIVE_TARGET_CATEGORIES,
  aheadDiscoveryTaxonomy,
  legacyNearbyPlacesTaxonomy,
  isLegacyNearbyTypeAllowed,
  providerTargetType,
} from '../src/policies/discoveryTaxonomyPolicy';
import { aheadDiscoveryRankingPolicy, legacyNearbyPlacesRankingPolicy } from '../src/policies/discoveryRankingPolicy';
import { chooseBestCandidate, popularityScore, rankCandidates, scoreCandidate } from '../src/services/aheadDiscoveryScoring';
import { normalizeTargetType } from '../src/services/aheadDiscoveryFiltering';
import { legacyNearbyPopularityScore } from '../src/services/googlePlaces';

function candidate(targetType: AheadDiscoveryTargetType, input: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    providerId: targetType,
    provider: 'google',
    name: targetType,
    targetType,
    latitude: 40,
    longitude: -90,
    distanceMeters: 3500,
    bearingDegrees: 0,
    headingDeltaDegrees: 8,
    isAhead: true,
    providerTypes: [targetType],
    ...input,
  };
}

for (const rule of aheadDiscoveryTaxonomy.providerTypeRules) {
  for (const providerType of rule.providerTypes) {
    assert.equal(providerTargetType([providerType]), rule.targetType, `${providerType} policy mapping`);
    assert.equal(normalizeTargetType([providerType]), rule.targetType, `${providerType} service mapping`);
  }
}
assert.deepEqual(DISCOVERY_NARRATIVE_TARGET_CATEGORIES,
  aheadDiscoveryTaxonomy.providerTypeRules.map(rule => rule.targetType));

for (const deniedType of aheadDiscoveryTaxonomy.forbiddenProviderTypes) {
  assert.equal(normalizeTargetType([deniedType]), null, `${deniedType} remains denied`);
}
for (const culturalType of aheadDiscoveryTaxonomy.culturalExceptionTypes) {
  assert.notEqual(normalizeTargetType([culturalType, 'store']), null, `${culturalType} retains cultural exception`);
}
assert.equal(normalizeTargetType(['museum', 'cafe', 'store']), 'museum', 'museum wins over attached cafe/store');
assert.equal(isLegacyNearbyTypeAllowed(['museum', 'cafe', 'store']), false,
  'the same mixed cultural/commercial case stays rejected in the legacy branch');
assert.equal(normalizeTargetType(['tourist_attraction', 'cafe']), null,
  'tourist attraction is mapped but is not a cultural deny exception in current production behavior');
assert.equal(normalizeTargetType(['locality', 'museum']), 'city', 'ordered precedence remains first-match');
assert.equal(normalizeTargetType(['point_of_interest']), null, 'ambiguous provider type remains rejected');

assert.equal(isLegacyNearbyTypeAllowed(['museum']), true);
for (const legacyOnlyType of ['church','library','stadium']) {
  assert.equal(isLegacyNearbyTypeAllowed([legacyOnlyType]), true, `${legacyOnlyType} remains supported by legacy branch`);
  assert.equal(normalizeTargetType([legacyOnlyType]), null, `${legacyOnlyType} is not added to Ahead Discovery`);
}
assert.equal(isLegacyNearbyTypeAllowed(['museum', 'store']), false,
  'legacy forbidden-first behavior remains intentionally different from Ahead Discovery');
assert.equal(isLegacyNearbyTypeAllowed(['point_of_interest']), false);
assert.equal(aheadDiscoveryTaxonomy.forbiddenRule,'cultural_exception_then_forbidden');
assert.equal(legacyNearbyPlacesTaxonomy.precedence,'forbidden_first');

assert.deepEqual(aheadDiscoveryRankingPolicy.categoryPriority, {
  city:1,town:1,locality:1,region:2,national_park:2,natural_feature:2,
  historical_landmark:3,cultural_landmark:3,state_park:4,bridge:4,
  monument:5,visitor_center:5,museum:6,university:6,park:7,other_significant_place:8,
});
assert.deepEqual(aheadDiscoveryRankingPolicy.popularity,
  {ratingMaximum:5,ratingWeight:0.35,ratingCountCap:5000,ratingCountWeight:0.65});
assert.equal(popularityScore(5,10), 0.3513, 'high rating / low review baseline');
assert.equal(popularityScore(4,5000), 0.9299999999999999, 'lower rating / high review baseline');
assert.equal(popularityScore(5,10000), 1, 'review count remains capped at 5000');
assert.deepEqual(legacyNearbyPlacesRankingPolicy,
  {ratingMultiplier:10,ratingCountDivisor:100,ratingCountContributionCap:50});
assert.equal(legacyNearbyPopularityScore({rating:4.5,user_ratings_total:1200}),57,
  'legacy Nearby Places popularity order remains unchanged');

const baselineScores: Record<string, number> = {
  city:0.739,historical_landmark:0.659,bridge:0.619,museum:0.539,park:0.499,university:0.539,
};
for (const [type, expected] of Object.entries(baselineScores)) {
  assert.equal(scoreCandidate(candidate(type as AheadDiscoveryTargetType)).score, expected, `${type} rounded score baseline`);
}

const rankedInput = [
  candidate('city'),
  candidate('historical_landmark',{rating:4,userRatingCount:5000}),
  candidate('bridge'),
  candidate('museum',{rating:4,userRatingCount:5000}),
  candidate('park'),
  candidate('university',{rating:4,userRatingCount:5000}),
];
assert.deepEqual(rankCandidates(rankedInput).map(item => item.candidate.targetType),
  ['historical_landmark','city','museum','university','bridge','park'], 'sorted order baseline');

const current = candidate('city',{providerId:'current',headingDeltaDegrees:10});
const closeChallenger = candidate('city',{providerId:'challenger',headingDeltaDegrees:9});
assert.deepEqual(chooseBestCandidate([current,closeChallenger],current), {
  selected: scoreCandidate(current,current.providerId), replaced:false, retained:true,
}, 'current target stability baseline');
const weakCurrent = candidate('city',{providerId:'weak',headingDeltaDegrees:65,distanceMeters:24000});
const strong = candidate('historical_landmark',{providerId:'strong',headingDeltaDegrees:0,distanceMeters:600,rating:5,userRatingCount:5000});
const replacement = chooseBestCandidate([weakCurrent,strong],weakCurrent);
assert.equal(replacement.selected?.candidate.providerId,'strong');
assert.equal(replacement.replaced,true);

console.log('Discovery taxonomy/ranking policy behavior-equivalence tests passed');
