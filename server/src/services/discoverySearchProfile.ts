import { aheadDiscovery } from '../config';
import type { MovementContext } from './aheadDiscoveryTypes';

/** Deterministic search geometry; urban travel must not inherit highway projection. */
export function discoverySearchProfile(movement: MovementContext) {
  const speed = movement.speedMps ?? 0;
  if (speed * 3.6 < aheadDiscovery.walkingHeadingThresholdKmh) return aheadDiscovery.searchProfiles.walking;
  if (speed < aheadDiscovery.highwayThresholdMps) return aheadDiscovery.searchProfiles.urban;
  return aheadDiscovery.searchProfiles.highway;
}
