import type { LocationEvent } from '../../location/types';
import type { GuidePreference, SupportedLocale } from '../../localization/preferences';
import { tourB, tourBTargets } from '../tours';
import type { DemoTarget } from '../tours/types';
import { distanceMeters } from './distance';
import type { JourneyState } from './modes';

export type NarrativeState = 'hidden' | 'approach' | 'arrival' | 'paused' | 'completed';

export type GuidedTourState = {
  tourId: string;
  journeyState: JourneyState;
  currentTargetIndex: number;
  currentTargetId?: string;
  completedTargetIds: string[];
  arrivedTargetIds: string[];
  narratedTargetIds: string[];
  location?: LocationEvent;
  distanceToCurrentTargetMeters?: number;
  narrativeState: NarrativeState;
  autoContinueRemainingMs?: number;
  isPaused: boolean;
  guideId: GuidePreference;
  guideLanguage: SupportedLocale;
};

export function createInitialGuidedTourState(
  guideId: GuidePreference,
  guideLanguage: SupportedLocale
): GuidedTourState {
  return {
    tourId: tourB.id,
    journeyState: 'idle',
    currentTargetIndex: 0,
    currentTargetId: tourB.targetIds[0],
    completedTargetIds: [],
    arrivedTargetIds: [],
    narratedTargetIds: [],
    narrativeState: 'hidden',
    isPaused: false,
    guideId,
    guideLanguage,
  };
}

export function startGuidedTour(state: GuidedTourState): GuidedTourState {
  return {
    ...state,
    journeyState: 'exploring',
    currentTargetIndex: 0,
    currentTargetId: tourB.targetIds[0],
    completedTargetIds: [],
    arrivedTargetIds: [],
    narratedTargetIds: [],
    narrativeState: 'hidden',
    isPaused: false,
  };
}

export function getCurrentTarget(state: GuidedTourState): DemoTarget | undefined {
  return tourBTargets[state.currentTargetIndex];
}

export function getNarrativeTarget(state: GuidedTourState): DemoTarget | undefined {
  return tourBTargets.find((target) => target.id === state.currentTargetId);
}

export function analyzeLocationEvent(
  state: GuidedTourState,
  location: LocationEvent
): GuidedTourState {
  if (state.isPaused || state.journeyState === 'narrating' || state.journeyState === 'waiting_to_continue' || state.journeyState === 'completed') {
    return { ...state, location };
  }

  const target = getCurrentTarget(state);
  if (!target) return { ...state, location, journeyState: 'completed' };

  const distance = distanceMeters(location, target.coordinates);
  const nextStateBase = {
    ...state,
    location,
    currentTargetId: target.id,
    distanceToCurrentTargetMeters: distance,
  };

  if (distance <= target.triggerRadii.arrivalMeters) {
    if (state.arrivedTargetIds.includes(target.id)) {
      return nextStateBase;
    }
    return {
      ...nextStateBase,
      journeyState: 'arrived',
      narrativeState: 'arrival',
      arrivedTargetIds: [...state.arrivedTargetIds, target.id],
    };
  }

  if (distance <= target.triggerRadii.approachMeters) {
    return {
      ...nextStateBase,
      journeyState: 'approaching',
      narrativeState: state.narrativeState === 'hidden' ? 'approach' : state.narrativeState,
    };
  }

  if (distance <= target.triggerRadii.discoveryMeters) {
    return { ...nextStateBase, journeyState: 'exploring' };
  }

  return { ...nextStateBase, journeyState: 'exploring' };
}

export function beginNarrative(state: GuidedTourState): GuidedTourState {
  if (state.journeyState !== 'arrived') return state;
  return {
    ...state,
    journeyState: 'narrating',
    narrativeState: 'arrival',
  };
}

export function completeNarrative(state: GuidedTourState): GuidedTourState {
  const target = getCurrentTarget(state);
  if (!target) return state;
  if (state.narratedTargetIds.includes(target.id)) return state;
  return {
    ...state,
    journeyState: 'waiting_to_continue',
    narrativeState: 'completed',
    narratedTargetIds: [...state.narratedTargetIds, target.id],
    autoContinueRemainingMs: tourB.continueDelaySec * 1000,
  };
}

export function tickAutoContinue(state: GuidedTourState, deltaMs: number): GuidedTourState {
  if (state.isPaused || state.journeyState !== 'waiting_to_continue') return state;
  const remaining = Math.max(0, (state.autoContinueRemainingMs ?? 0) - deltaMs);
  if (remaining === 0) return continueToNextTarget(state);
  return { ...state, autoContinueRemainingMs: remaining };
}

export function continueToNextTarget(state: GuidedTourState): GuidedTourState {
  const target = getCurrentTarget(state);
  const completedTargetIds =
    target && !state.completedTargetIds.includes(target.id)
      ? [...state.completedTargetIds, target.id]
      : state.completedTargetIds;
  const nextIndex = state.currentTargetIndex + 1;
  const nextTarget = tourBTargets[nextIndex];

  if (!nextTarget) {
    return {
      ...state,
      completedTargetIds,
      journeyState: 'completed',
      narrativeState: 'completed',
      currentTargetId: undefined,
      autoContinueRemainingMs: undefined,
    };
  }

  return {
    ...state,
    completedTargetIds,
    currentTargetIndex: nextIndex,
    currentTargetId: nextTarget.id,
    journeyState: 'moving_to_next_target',
    narrativeState: 'hidden',
    autoContinueRemainingMs: undefined,
  };
}

export function pauseGuidedTour(state: GuidedTourState): GuidedTourState {
  return { ...state, isPaused: true, journeyState: 'paused' };
}

export function resumeGuidedTour(state: GuidedTourState): GuidedTourState {
  return {
    ...state,
    isPaused: false,
    journeyState:
      state.narrativeState === 'arrival'
        ? 'narrating'
        : state.narrativeState === 'completed'
          ? 'waiting_to_continue'
          : 'exploring',
  };
}

export function stopGuidedTour(state: GuidedTourState): GuidedTourState {
  return {
    ...state,
    journeyState: 'idle',
    narrativeState: 'hidden',
    isPaused: false,
    autoContinueRemainingMs: undefined,
  };
}
