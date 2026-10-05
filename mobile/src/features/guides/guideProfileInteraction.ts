import type { GuidePreference } from '../../localization/preferences';

export const guideProfileOrder: GuidePreference[] = ['dana', 'arthur'];

export function shouldCaptureGuideSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) >= 20 && Math.abs(dx) > Math.abs(dy) * 1.2;
}

export function resolveGuideSwipe(
  current: GuidePreference,
  dx: number,
  dy: number,
): GuidePreference {
  if (!shouldCaptureGuideSwipe(dx, dy) || Math.abs(dx) < 48) return current;
  const index = guideProfileOrder.indexOf(current);
  const direction = dx < 0 ? 1 : -1;
  return guideProfileOrder[(index + direction + guideProfileOrder.length) % guideProfileOrder.length];
}
