import { useEffect, useMemo, useState } from 'react';
import { tourB, tourBTargets } from '../../demo/tours';
import type { ExplorationMode } from '../../demo/guidedTour';
import type { GuidePreference, SupportedLocale } from '../../localization/preferences';

export function createExploreNarrativeViewModel(input: {
  targetId: string | null;
  isPaused: boolean;
  guideId: GuidePreference;
  guideLanguage: SupportedLocale;
}) {
  const target = tourBTargets.find((item) => item.id === input.targetId);
  return {
    activeTargetId: input.targetId,
    isPaused: input.isPaused,
    target,
    narrative: target?.narratives[input.guideId][input.guideLanguage],
    passiveMapUserCoordinate: target?.coordinates ?? tourB.startCoordinate,
  };
}

export function useExploreNarrative(input: {
  mode: ExplorationMode;
  guideId: GuidePreference;
  guideLanguage: SupportedLocale;
}) {
  const { mode, guideId, guideLanguage } = input;
  const [targetId, setTargetId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    setTargetId(null);
    setIsPaused(false);
  }, [mode]);

  const viewModel = useMemo(
    () => createExploreNarrativeViewModel({ targetId, isPaused, guideId, guideLanguage }),
    [guideId, guideLanguage, isPaused, targetId]
  );

  const trigger = (nextTargetId: string) => {
    const target = tourBTargets.find((item) => item.id === nextTargetId);
    if (!target) return;
    setTargetId(nextTargetId);
    setIsPaused(false);
  };

  const close = () => {
    setTargetId(null);
    setIsPaused(false);
  };

  return {
    ...viewModel,
    trigger,
    close,
    pause: () => setIsPaused(true),
    resume: () => setIsPaused(false),
    reset: close,
  };
}
