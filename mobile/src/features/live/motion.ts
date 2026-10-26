/** Expo speed is m/s; API/calculation speed remains km/h. Unknown is not a stop. */
export function gpsSpeedKmh(speedMps: number | null | undefined): number | null {
  return typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps >= 0
    ? speedMps * 3.6 : null;
}
