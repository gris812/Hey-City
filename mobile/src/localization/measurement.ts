import type { UnitSystem } from './preferences';

/** Display-only conversions. The server and Google APIs continue using SI units. */
export function formatDistance(distanceMeters: number, units: UnitSystem): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return '—';
  if (units === 'imperial') {
    const feet = distanceMeters * 3.280839895;
    return feet < 1000 ? `${Math.round(feet)} ft` : `${(distanceMeters / 1609.344).toFixed(1)} mi`;
  }
  return distanceMeters < 1000
    ? `${Math.round(distanceMeters)} m`
    : `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function formatSpeed(speedKmh: number | null, units: UnitSystem): string {
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh < 0) return '—';
  return units === 'imperial'
    ? `${(speedKmh / 1.609344).toFixed(1)} mph`
    : `${speedKmh.toFixed(1)} km/h`;
}
