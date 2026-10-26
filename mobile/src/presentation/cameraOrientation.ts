/** Presentation-only map camera state; no routing or provider lookups. */
export type MapOrientation = 'north-up' | 'course-up';

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function courseHeading(
  heading: number | null | undefined,
  speedKmh: number | null | undefined,
): number | null {
  if (typeof heading !== 'number' || !Number.isFinite(heading) || heading < 0 ||
      typeof speedKmh !== 'number' || !Number.isFinite(speedKmh) || speedKmh < 7) return null;
  return normalizeDegrees(heading);
}

export function shortestHeadingDelta(from: number, to: number): number {
  return ((normalizeDegrees(to) - normalizeDegrees(from) + 540) % 360) - 180;
}

export function shouldUpdateCamera(following: boolean, hasLocation: boolean): boolean {
  return following && hasLocation;
}
