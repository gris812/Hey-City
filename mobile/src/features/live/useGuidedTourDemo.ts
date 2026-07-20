import { useEffect, useMemo, useState } from 'react';
import type { LocationEvent } from '../../location/types';
import { tourB, tourBTargets } from '../../demo/tours';
import {
  analyzeLocationEvent,
  beginNarrative,
  completeNarrative,
  continueToNextTarget,
  createInitialGuidedTourState,
  getCurrentTarget,
  getNarrativeTarget,
  pauseGuidedTour,
  resumeGuidedTour,
  startGuidedTour,
  tickAutoContinue,
  tourBLocationEvents,
  type ExplorationMode,
  type GuidedTourState,
} from '../../demo/guidedTour';
import type { GuidePreference, SupportedLocale } from '../../localization/preferences';
import { shouldSyncPreferencesToTour } from '../../presentation/liveForeground';
import { colors } from '../../theme';

export function resetGuidedTourState(
  guideId: GuidePreference,
  guideLanguage: SupportedLocale
): GuidedTourState {
  return createInitialGuidedTourState(guideId, guideLanguage);
}

export function createGuidedTargetMarkers(input: {
  state: GuidedTourState;
  guideId: GuidePreference;
  guideLanguage: SupportedLocale;
  currentTargetId?: string;
}) {
  return tourBTargets.map((target) => ({
    id: target.id,
    coordinate: target.coordinates,
    title: target.narratives[input.guideId][input.guideLanguage].title,
    pinColor: input.state.completedTargetIds.includes(target.id)
      ? '#34C759'
      : input.currentTargetId === target.id
        ? colors.warning
        : '#8E8E93',
  }));
}

export function createSnapshotLocation(target: (typeof tourBTargets)[number]): LocationEvent {
  return {
    ...target.coordinates,
    heading: 24,
    speedKmh: 4.2,
    timestampMs: Date.now(),
  };
}

export function useGuidedTourDemo(input: {
  mode: ExplorationMode;
  preferredGuideId: GuidePreference;
  guideLanguage: SupportedLocale;
}) {
  const { mode, preferredGuideId, guideLanguage } = input;
  const [tourState, setTourState] = useState<GuidedTourState>(() =>
    createInitialGuidedTourState(preferredGuideId, guideLanguage)
  );
  const [tourEventIndex, setTourEventIndex] = useState(0);
  const [narrativeRemainingMs, setNarrativeRemainingMs] = useState<number | null>(null);

  const activeGuideId = tourState.guideId;
  const activeGuideLanguage = tourState.guideLanguage;
  const currentTarget = getCurrentTarget(tourState);
  const narrativeTarget = getNarrativeTarget(tourState);
  const activeNarrative = narrativeTarget?.narratives[activeGuideId][activeGuideLanguage];
  const currentTargetNarrative = currentTarget?.narratives[activeGuideId][activeGuideLanguage];
  const currentTargetTitle = currentTargetNarrative?.title ?? currentTarget?.name ?? '-';
  const approachText =
    tourState.narrativeState === 'approach' && activeNarrative?.approachText
      ? activeNarrative.approachText
      : null;
  const completedTargetIndex = tourState.completedTargetIds.length
    ? Math.max(
        0,
        tourBTargets.findIndex(
          (target) => target.id === tourState.completedTargetIds[tourState.completedTargetIds.length - 1]
        )
      )
    : 0;
  const completedRouteCoordinates = tourState.completedTargetIds.length
    ? tourBTargets.slice(0, completedTargetIndex + 1).flatMap((target, index) =>
        index === 0 ? target.route.routeCoordinates : target.route.routeCoordinates.slice(1)
      )
    : [tourB.startCoordinate];
  const upcomingRouteCoordinates = tourBTargets
    .slice(Math.max(0, tourState.currentTargetIndex))
    .flatMap((target, index) =>
      index === 0 ? target.route.routeCoordinates : target.route.routeCoordinates.slice(1)
    );
  const guidedTargetMarkers = useMemo(
    () =>
      createGuidedTargetMarkers({
        state: tourState,
        guideId: activeGuideId,
        guideLanguage: activeGuideLanguage,
        currentTargetId: currentTarget?.id,
      }),
    [activeGuideId, activeGuideLanguage, currentTarget?.id, tourState]
  );

  useEffect(() => {
    setTourState((current) => {
      if (!shouldSyncPreferencesToTour(current.journeyState)) return current;
      return {
        ...current,
        guideId: preferredGuideId,
        guideLanguage,
      };
    });
  }, [guideLanguage, preferredGuideId]);

  useEffect(() => {
    if (mode !== 'guided_tour') return;
    if (tourState.isPaused) return;
    if (
      tourState.journeyState === 'idle' ||
      tourState.journeyState === 'narrating' ||
      tourState.journeyState === 'waiting_to_continue' ||
      tourState.journeyState === 'completed'
    ) {
      return;
    }

    const timer = setTimeout(() => {
      const event = tourBLocationEvents[tourEventIndex];
      if (!event) return;
      setTourState((current) => {
        const analyzed = analyzeLocationEvent(current, event);
        if (analyzed.journeyState === 'arrived') {
          const target = getCurrentTarget(analyzed);
          setNarrativeRemainingMs(
            (target?.narratives[activeGuideId][activeGuideLanguage].estimatedDurationSec ?? 8) *
              1000
          );
          return beginNarrative(analyzed);
        }
        return analyzed;
      });
      setTourEventIndex((index) => index + 1);
    }, 700);

    return () => clearTimeout(timer);
  }, [activeGuideId, activeGuideLanguage, mode, tourEventIndex, tourState]);

  useEffect(() => {
    if (tourState.journeyState !== 'narrating' || tourState.isPaused || narrativeRemainingMs === null) return;
    if (narrativeRemainingMs <= 0) {
      setTourState((current) => completeNarrative(current));
      setNarrativeRemainingMs(null);
      return;
    }
    const timer = setTimeout(() => setNarrativeRemainingMs((value) => Math.max(0, (value ?? 0) - 1000)), 1000);
    return () => clearTimeout(timer);
  }, [narrativeRemainingMs, tourState.isPaused, tourState.journeyState]);

  useEffect(() => {
    if (tourState.journeyState !== 'waiting_to_continue' || tourState.isPaused) return;
    const timer = setTimeout(() => setTourState((current) => tickAutoContinue(current, 1000)), 1000);
    return () => clearTimeout(timer);
  }, [tourState]);

  const startTour = () => {
    setTourEventIndex(0);
    setNarrativeRemainingMs(null);
    setTourState(startGuidedTour(createInitialGuidedTourState(preferredGuideId, guideLanguage)));
  };

  const stopTour = () => {
    setTourState((current) => createInitialGuidedTourState(current.guideId, current.guideLanguage));
    setTourEventIndex(0);
    setNarrativeRemainingMs(null);
  };

  const continueTour = () => {
    setNarrativeRemainingMs(null);
    setTourState((current) => continueToNextTarget(completeNarrative(current)));
  };

  const applySnapshotState = (state: GuidedTourState, remainingMs: number | null, eventIndex = 0) => {
    setTourState(state);
    setNarrativeRemainingMs(remainingMs);
    setTourEventIndex(eventIndex);
  };

  return {
    tourState,
    activeGuideId,
    activeGuideLanguage,
    currentTarget,
    narrativeTarget,
    activeNarrative,
    currentTargetTitle,
    approachText,
    completedRouteCoordinates,
    upcomingRouteCoordinates,
    guidedTargetMarkers,
    narrativeRemainingMs,
    startTour,
    stopTour,
    continueTour,
    pauseTour: () => setTourState((current) => pauseGuidedTour(current)),
    resumeTour: () => setTourState((current) => resumeGuidedTour(current)),
    applySnapshotState,
  };
}
