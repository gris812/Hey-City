/** Expo Location speed is meters/second. Negative and missing values mean unknown. */
export function gpsSpeedKmh(speedMps: number | null | undefined): number | null {
  return typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps >= 0
    ? speedMps * 3.6
    : null;
}
