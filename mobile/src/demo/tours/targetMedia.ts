import type { SupportedLocale } from '../../localization/preferences';
import type { DemoTarget, TargetMedia } from './types';

export function resolveTargetMedia(
  target: DemoTarget,
  locale: SupportedLocale,
  imageFailed = false,
  imageSources: Record<string, TargetMedia['imageSource']> = {}
): TargetMedia {
  const imageKey = target.media?.imageAsset;
  const imageSource =
    !imageFailed && imageKey && imageKey in imageSources
      ? imageSources[imageKey]
      : undefined;

  return {
    imageSource,
    imageAlt: target.media?.altText[locale],
    attribution: target.media?.attribution,
  };
}
