import type { LocationEvent } from '../../location/types';
import { tourB, tourBTargets } from '../tours';
import type { Coordinate } from '../tours/types';
import { distanceMeters, headingDegrees } from './distance';

const startTimestampMs = 1_700_010_000_000;
const intervalMs = 1000;

function interpolate(a: Coordinate, b: Coordinate, steps: number): Coordinate[] {
  return Array.from({ length: steps }, (_, index) => {
    const ratio = (index + 1) / steps;
    return {
      latitude: a.latitude + (b.latitude - a.latitude) * ratio,
      longitude: a.longitude + (b.longitude - a.longitude) * ratio,
    };
  });
}

export function createTourBLocationEvents(): LocationEvent[] {
  const points: Coordinate[] = [tourB.startCoordinate];
  for (let i = 0; i < tourB.fullRouteCoordinates.length - 1; i += 1) {
    const from = tourB.fullRouteCoordinates[i];
    const to = tourB.fullRouteCoordinates[i + 1];
    const steps = Math.max(3, Math.ceil(distanceMeters(from, to) / 80));
    points.push(...interpolate(from, to, steps));
  }

  for (const target of tourBTargets) {
    const index = points.findIndex((point) => distanceMeters(point, target.coordinates) < 8);
    if (index === -1) points.push(target.coordinates);
  }

  return points.map((point, index) => {
    const next = points[index + 1] ?? point;
    const distance = distanceMeters(point, next);
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      heading: headingDegrees(point, next),
      speedKmh: Math.max(0, distance * 3.6),
      timestampMs: startTimestampMs + index * intervalMs,
      accuracyMeters: 5,
    };
  });
}

export const tourBLocationEvents = createTourBLocationEvents();
