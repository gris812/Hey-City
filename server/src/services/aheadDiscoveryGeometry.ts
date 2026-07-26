import { aheadDiscovery } from '../config';
import { distanceMeters, pointAhead } from './geo';
import type { CandidateGeometry, MovementContext, ProviderDiscoveryCandidate } from './aheadDiscoveryTypes';

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function normalizeHeading(heading: number): number {
  return ((heading % 360) + 360) % 360;
}

export function bearingDegrees(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI);
}

export function headingDeltaDegrees(a: number, b: number): number {
  const delta = Math.abs(normalizeHeading(a) - normalizeHeading(b));
  return Math.min(delta, 360 - delta);
}

export function createCandidateGeometry(
  movement: MovementContext,
  candidate: Pick<ProviderDiscoveryCandidate, 'latitude' | 'longitude'>
): CandidateGeometry {
  const distance = distanceMeters(
    movement.latitude,
    movement.longitude,
    candidate.latitude,
    candidate.longitude
  );
  const bearing = bearingDegrees(
    movement.latitude,
    movement.longitude,
    candidate.latitude,
    candidate.longitude
  );
  const delta =
    movement.headingDegrees === null
      ? 180
      : headingDeltaDegrees(movement.headingDegrees, bearing);
  return {
    distanceMeters: Math.round(distance),
    bearingDegrees: Math.round(bearing),
    headingDeltaDegrees: Math.round(delta),
    isAhead: delta <= aheadDiscovery.maxHeadingDeltaDegrees,
  };
}

export function projectedSearchPoint(movement: MovementContext): { latitude: number; longitude: number } {
  const heading = movement.headingDegrees ?? 0;
  const point = pointAhead(
    movement.latitude,
    movement.longitude,
    heading,
    aheadDiscovery.projectedSearchDistanceMeters
  );
  return { latitude: point.lat, longitude: point.lng };
}

export function deriveHeadingFromMovement(
  previous: MovementContext | null,
  current: MovementContext
): number | null {
  if (current.headingDegrees !== null) return normalizeHeading(current.headingDegrees);
  if (!previous) return null;
  const movedMeters = distanceMeters(
    previous.latitude,
    previous.longitude,
    current.latitude,
    current.longitude
  );
  if (movedMeters < 10) return null;
  return bearingDegrees(previous.latitude, previous.longitude, current.latitude, current.longitude);
}

export function isMovementStale(movement: MovementContext, nowMs: number): boolean {
  const timestampMs = Date.parse(movement.timestamp);
  if (!Number.isFinite(timestampMs)) return true;
  return nowMs - timestampMs > aheadDiscovery.evaluationSeconds * 3 * 1000;
}

export function validateMovementContext(
  movement: MovementContext,
  nowMs: number
): 'bad_gps' | 'stale_gps' | 'missing_heading' | null {
  if (!isValidCoordinate(movement.latitude, movement.longitude)) return 'bad_gps';
  if (movement.accuracyMeters > aheadDiscovery.minGpsAccuracyMeters) return 'bad_gps';
  if (isMovementStale(movement, nowMs)) return 'stale_gps';
  if (movement.headingDegrees === null) return 'missing_heading';
  return null;
}
