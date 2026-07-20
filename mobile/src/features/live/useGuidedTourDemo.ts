import { useEffect, useMemo, useState } from 'react';
import type { LocationEvent } from '../../location/types';
import { tourB, tourBTargets } from '../../demo/tours';
import {
  analyzeLocationEvent,
  arrivalAutoplayDelayMs,
  beginNarrative,
  completeNarrative,
  continueToNextTarget,
  createInitialGuidedTourState,
  getCurrentTarget,
  getNarrativeTarget,
  pauseGuidedTour,
  prepareAtTarget,
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

export function shouldAutoplayArrival(input: {
  journeyState: GuidedTourState['journeyState'];
  isPaused: boolean;
  autoplay: boolean;
}): boolean {
  return input.autoplay && !input.isPaused && input.journeyState === 'at_target';
}

export function createGuidedTourControllerSnapshot(input: {
  state: GuidedTourState;
  eventIndex: number;
  autoplay: boolean;
  arrivalDelayRemainingMs: number | null;
  narrativeRemainingMs: number | null;
}) {
  return {
    journeyState: input.state.journeyState,
    narrativeState: input.state.narrativeState,
    guideId: input.state.guideId,
    guideLanguage: input.state.guideLanguage,
    eventIndex: input.eventIndex,
    autoplay: input.autoplay,
    arrivalDelayRemainingMs: input.arrivalDelayRemainingMs,
    narrativeRemainingMs: input.narrativeRemainingMs,
    currentTargetId: input.state.currentTargetId,
    completedTargetIds: input.state.completedTargetIds,
  };
}

export type GuidedTourHarnessState = {
  state: GuidedTourState;
  eventIndex: number;
  autoplay: boolean;
  arrivalDelayRemainingMs: number | null;
  narrativeRemainingMs: number | null;
};

export function createGuidedTourHarness(input: {
  guideId: GuidePreference;
  guideLanguage: SupportedLocale;
  autoplay?: boolean;
}): GuidedTourHarnessState {
  return {
    state: startGuidedTour(createInitialGuidedTourState(input.guideId, input.guideLanguage)),
    eventIndex: 0,
    autoplay: input.autoplay ?? true,
    arrivalDelayRemainingMs: null,
    narrativeRemainingMs: null,
  };
}

export function advanceGuidedTourHarness(
  harness: GuidedTourHarnessState,
  deltaMs = 700
): GuidedTourHarnessState {
  if (
    harness.state.journeyState !== 'narrating' &&
    harness.state.journeyState !== 'waiting_to_continue' &&
    harness.state.journeyState !== 'completed' &&
    harness.state.journeyState !== 'at_target'
  ) {
    const event = tourBLocationEvents[harness.eventIndex];
    if (!event) return harness;
    const analyzed = analyzeLocationEvent(harness.state, event);
    if (analyzed.journeyState === 'arrived') {
      return {
        ...harness,
        state: prepareAtTarget(analyzed),
        eventIndex: harness.eventIndex + 1,
        arrivalDelayRemainingMs: harness.autoplay ? arrivalAutoplayDelayMs : null,
        narrativeRemainingMs: null,
      };
    }
    return {
      ...harness,
      state: analyzed,
      eventIndex: harness.eventIndex + 1,
    };
  }

  if (harness.state.journeyState === 'at_target' && harness.autoplay) {
    const remaining = Math.max(0, (harness.arrivalDelayRemainingMs ?? arrivalAutoplayDelayMs) - deltaMs);
    if (remaining > 0) return { ...harness, arrivalDelayRemainingMs: remaining };
    const target = getCurrentTarget(harness.state);
    return {
      ...harness,
      state: beginNarrative(harness.state),
      arrivalDelayRemainingMs: null,
      narrativeRemainingMs:
        (target?.narratives[harness.state.guideId][harness.state.guideLanguage].estimatedDurationSec ?? 8) *
        1000,
    };
  }

  if (harness.state.journeyState === 'narrating') {
    const remaining = Math.max(0, (harness.narrativeRemainingMs ?? 0) - deltaMs);
    if (remaining > 0) return { ...harness, narrativeRemainingMs: remaining };
    return {
      ...harness,
      state: completeNarrative(harness.state),
      narrativeRemainingMs: null,
    };
  }

  if (harness.state.journeyState === 'waiting_to_continue') {
    return { ...harness, state: tickAutoContinue(harness.state, deltaMs) };
  }

  return harness;
}

export function startStoryInGuidedTourHarness(harness: GuidedTourHarnessState): GuidedTourHarnessState {
  const target = getCurrentTarget(harness.state);
  return {
    ...harness,
    state: beginNarrative(harness.state),
    arrivalDelayRemainingMs: null,
    narrativeRemainingMs:
      (target?.narratives[harness.state.guideId][harness.state.guideLanguage].estimatedDurationSec ?? 8) *
      1000,
  };
}

export function useGuidedTourDemo(input: {
  mode: ExplorationMode;
  preferredGuideId: GuidePreference;
  guideLanguage: SupportedLocale;
  autoplay?: boolean;
}) {
  const { mode, preferredGuideId, guideLanguage, autoplay = true } = input;
  const [tourState, setTourState] = useState<GuidedTourState>(() =>
    createInitialGuidedTourState(preferredGuideId, guideLanguage)
  );
  const [tourEventIndex, setTourEventIndex] = useState(0);
  const [narrativeRemainingMs, setNarrativeRemainingMs] = useState<number | null>(null);
  const [arrivalDelayRemainingMs, setArrivalDelayRemainingMs] = useState<number | null>(null);

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
    if (mode === 'guided_tour') return;
    setTourEventIndex(0);
    setNarrativeRemainingMs(null);
    setArrivalDelayRemainingMs(null);
    setTourState((current) => {
      if (current.journeyState === 'idle') return current;
      return createInitialGuidedTourState(current.guideId, current.guideLanguage);
    });
  }, [mode]);

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
          setArrivalDelayRemainingMs(autoplay ? arrivalAutoplayDelayMs : null);
          setNarrativeRemainingMs(null);
          return prepareAtTarget(analyzed);
        }
        return analyzed;
      });
      setTourEventIndex((index) => index + 1);
    }, 700);

    return () => clearTimeout(timer);
  }, [autoplay, mode, tourEventIndex, tourState]);

  useEffect(() => {
    if (!shouldAutoplayArrival({ journeyState: tourState.journeyState, isPaused: tourState.isPaused, autoplay })) {
      return;
    }
    if (arrivalDelayRemainingMs === null) {
      setArrivalDelayRemainingMs(arrivalAutoplayDelayMs);
      return;
    }
    if (arrivalDelayRemainingMs <= 0) {
      const target = getCurrentTarget(tourState);
      setNarrativeRemainingMs(
        (target?.narratives[activeGuideId][activeGuideLanguage].estimatedDurationSec ?? 8) *
          1000
      );
      setArrivalDelayRemainingMs(null);
      setTourState((current) => beginNarrative(current));
      return;
    }
    const timer = setTimeout(
      () => setArrivalDelayRemainingMs((value) => Math.max(0, (value ?? 0) - 600)),
      600
    );
    return () => clearTimeout(timer);
  }, [activeGuideId, activeGuideLanguage, arrivalDelayRemainingMs, autoplay, tourState]);

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
    setArrivalDelayRemainingMs(null);
    setTourState(startGuidedTour(createInitialGuidedTourState(preferredGuideId, guideLanguage)));
  };

  const stopTour = () => {
    setTourState((current) => createInitialGuidedTourState(current.guideId, current.guideLanguage));
    setTourEventIndex(0);
    setNarrativeRemainingMs(null);
    setArrivalDelayRemainingMs(null);
  };

  const continueTour = () => {
    setNarrativeRemainingMs(null);
    setArrivalDelayRemainingMs(null);
    setTourState((current) => continueToNextTarget(completeNarrative(current)));
  };

  const startStory = () => {
    const target = getCurrentTarget(tourState);
    setNarrativeRemainingMs(
      (target?.narratives[activeGuideId][activeGuideLanguage].estimatedDurationSec ?? 8) *
        1000
    );
    setArrivalDelayRemainingMs(null);
    setTourState((current) => beginNarrative(current));
  };

  const applySnapshotState = (
    state: GuidedTourState,
    remainingMs: number | null,
    eventIndex = 0,
    nextArrivalDelayRemainingMs: number | null = null
  ) => {
    setTourState(state);
    setNarrativeRemainingMs(remainingMs);
    setTourEventIndex(eventIndex);
    setArrivalDelayRemainingMs(nextArrivalDelayRemainingMs);
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
    arrivalDelayRemainingMs,
    startTour,
    stopTour,
    continueTour,
    startStory,
    pauseTour: () => setTourState((current) => pauseGuidedTour(current)),
    resumeTour: () => setTourState((current) => resumeGuidedTour(current)),
    applySnapshotState,
  };
}
