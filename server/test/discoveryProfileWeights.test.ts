import assert from 'node:assert/strict';
import {
  discoveryProfileIds,
  discoveryProfileWeights,
  discoveryScoreFactorIds,
  validateDiscoveryProfileWeights,
  type DiscoveryProfileId,
  type DiscoveryProfileWeights,
} from '../src/config/discoveryProfileWeights';

validateDiscoveryProfileWeights(discoveryProfileWeights);

for (const profileId of discoveryProfileIds) {
  const total = discoveryScoreFactorIds.reduce(
    (sum, factorId) => sum + discoveryProfileWeights[profileId][factorId],
    0
  );
  assert(Math.abs(total - 1) < 0.000_001, `${profileId} weights total 1.0`);
}

const invalidConfig = structuredClone(discoveryProfileWeights) as Record<
  DiscoveryProfileId,
  DiscoveryProfileWeights
>;
invalidConfig.road_trip.targetScale = 0.3;

assert.throws(
  () => validateDiscoveryProfileWeights(invalidConfig),
  /road_trip must total 1\.0/,
  'invalid profile totals are rejected'
);

console.log('discoveryProfileWeights tests passed');
