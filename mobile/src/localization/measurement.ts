import type { MeasurementSystem } from './preferences';

/** All domain calculations and API payloads remain SI; convert for display only. */
export function formatDistance(meters: number, system: MeasurementSystem): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (system === 'imperial') {
    const feet = meters * 3.280839895;
    return feet < 528 ? `${Math.round(feet)} ft` : `${(meters / 1609.344).toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatSpeed(kmh: number, system: MeasurementSystem): string {
  if (!Number.isFinite(kmh) || kmh < 0) return '—';
  return system === 'imperial'
    ? `${Math.round(kmh / 1.609344)} mph`
    : `${Math.round(kmh)} km/h`;
}
