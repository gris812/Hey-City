/**
 * Editable starting weights for adaptive discovery scoring.
 *
 * Keep every profile total equal to 1.0. The profile resolver and factor
 * evaluators will consume this configuration once the adaptive discovery
 * runtime slice is implemented.
 */

export const discoveryProfileIds = [
  'urban_nearby',
  'urban_corridor',
  'road_trip',
] as const;

export type DiscoveryProfileId = (typeof discoveryProfileIds)[number];

export const discoveryScoreFactorIds = [
  'routeAlignment',
  'approachTiming',
  'targetScale',
  'categoryFit',
  'significanceAndCoverage',
  'selectionStability',
] as const;

export type DiscoveryScoreFactorId = (typeof discoveryScoreFactorIds)[number];
export type DiscoveryProfileWeights = Record<DiscoveryScoreFactorId, number>;

export const discoveryProfileWeights = {
  urban_nearby: {
    routeAlignment: 0.1,
    approachTiming: 0.25,
    targetScale: 0.15,
    categoryFit: 0.25,
    significanceAndCoverage: 0.15,
    selectionStability: 0.1,
  },
  urban_corridor: {
    routeAlignment: 0.25,
    approachTiming: 0.25,
    targetScale: 0.15,
    categoryFit: 0.15,
    significanceAndCoverage: 0.1,
    selectionStability: 0.1,
  },
  road_trip: {
    routeAlignment: 0.25,
    approachTiming: 0.15,
    targetScale: 0.25,
    categoryFit: 0.15,
    significanceAndCoverage: 0.1,
    selectionStability: 0.1,
  },
} satisfies Record<DiscoveryProfileId, DiscoveryProfileWeights>;

const EXPECTED_WEIGHT_TOTAL = 1;
const WEIGHT_TOTAL_TOLERANCE = 0.000_001;

export function validateDiscoveryProfileWeights(
  config: Record<DiscoveryProfileId, DiscoveryProfileWeights>
): void {
  for (const profileId of discoveryProfileIds) {
    const weights = config[profileId];

    for (const factorId of discoveryScoreFactorIds) {
      const value = weights[factorId];
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(
          `Discovery weight ${profileId}.${factorId} must be between 0 and 1`
        );
      }
    }

    const total = discoveryScoreFactorIds.reduce(
      (sum, factorId) => sum + weights[factorId],
      0
    );
    if (Math.abs(total - EXPECTED_WEIGHT_TOTAL) > WEIGHT_TOTAL_TOLERANCE) {
      throw new Error(
        `Discovery weights for ${profileId} must total 1.0; received ${total}`
      );
    }
  }
}

validateDiscoveryProfileWeights(discoveryProfileWeights);
