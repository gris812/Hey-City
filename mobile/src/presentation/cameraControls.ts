/** Camera-only state: not movement classification and not Discovery policy. */
export type MapOrientation = 'north-up' | 'course-up';
export type CameraFollowState = { orientation: MapOrientation; following: boolean };

export function normalizeBearing(value: number): number {
  return ((value % 360) + 360) % 360;
}
export function shortestBearingDelta(from: number, to: number): number {
  const a = normalizeBearing(to) - normalizeBearing(from);
  return ((a + 540) % 360) - 180;
}
export function trustedCourse(
  heading: number | null | undefined,
  speedKmh: number | null | undefined,
  observedAtMs: number | null,
  nowMs: number,
): number | null {
  if (heading == null || !Number.isFinite(heading) || heading < 0 ||
      speedKmh == null || !Number.isFinite(speedKmh) || speedKmh < 3 ||
      observedAtMs === null || nowMs - observedAtMs > 20_000 ||
      nowMs < observedAtMs) return null;
  return normalizeBearing(heading);
}
export function orientationHeading(orientation: MapOrientation, reliableCourse: number | null, oldHeading: number): number {
  if (orientation === 'north-up') return 0;
  return reliableCourse ?? oldHeading; // freeze course when GPS direction is untrusted
}
