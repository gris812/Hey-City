import assert from 'node:assert/strict';
import { chooseBestCandidate, scoreCandidate } from '../src/services/aheadDiscoveryScoring';
import type { DiscoveryCandidate } from '@heycity/shared';

function candidate(input: Partial<DiscoveryCandidate> & Pick<DiscoveryCandidate, 'providerId' | 'name' | 'targetType'>): DiscoveryCandidate {
  return {
    provider: 'google',
    latitude: 40,
    longitude: -90,
    distanceMeters: 3500,
    bearingDegrees: 0,
    headingDeltaDegrees: 8,
    isAhead: true,
    providerTypes: [input.targetType],
    ...input,
  };
}

const city = candidate({ providerId: 'city', name: 'Springfield', targetType: 'city' });
const park = candidate({ providerId: 'park', name: 'Small Park', targetType: 'park', userRatingCount: 5000, rating: 5 });
assert(scoreCandidate(city).score > scoreCandidate(park).score, 'city ahead outranks low-priority park');

const landmark = candidate({ providerId: 'landmark', name: 'Historic Site', targetType: 'historical_landmark' });
assert(scoreCandidate(landmark).score > scoreCandidate(park).score, 'historical landmark outranks general park');

const current = candidate({ providerId: 'current', name: 'Current City', targetType: 'city', headingDeltaDegrees: 10 });
const challenger = candidate({ providerId: 'challenger', name: 'Other City', targetType: 'city', headingDeltaDegrees: 9 });
const retained = chooseBestCandidate([current, challenger], current);
assert.equal(retained.selected?.candidate.providerId, 'current', 'current target retained through small score changes');
assert.equal(retained.retained, true);

const weakerCurrent = candidate({ providerId: 'current', name: 'Current City', targetType: 'city', headingDeltaDegrees: 65, distanceMeters: 24000 });
const stronger = candidate({
  providerId: 'stronger',
  name: 'Historic Site',
  targetType: 'historical_landmark',
  headingDeltaDegrees: 0,
  distanceMeters: 600,
  rating: 5,
  userRatingCount: 5000,
});
const replaced = chooseBestCandidate([weakerCurrent, stronger], weakerCurrent);
assert.equal(replaced.selected?.candidate.providerId, 'stronger', 'materially stronger candidate replaces current target');
assert.equal(replaced.replaced, true);

console.log('aheadDiscoveryScoring tests passed');
