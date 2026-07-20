import type { GuidePreference, SupportedLocale } from '../localization/preferences';
import type { NarrativeState } from '../demo/guidedTour/controller';
import type { ExplorationMode, JourneyState } from '../demo/guidedTour/modes';

export type LiveForegroundPhase =
  | 'explore_idle'
  | 'guided_preferences'
  | 'guided_navigating'
  | 'guided_approaching'
  | 'guided_at_target'
  | 'guided_story_active'
  | 'guided_story_paused'
  | 'guided_story_complete'
  | 'guided_tour_complete'
  | 'drive_idle'
  | 'drive_active';

export type LiveOverlay =
  | { kind: 'tour_preferences' }
  | { kind: 'guide_quick_preview'; guideId: GuidePreference }
  | { kind: 'transcript'; returnPhase: LiveForegroundPhase }
  | null;

export type LiveForegroundInput = {
  mode: ExplorationMode;
  journeyState: JourneyState;
  narrativeState: NarrativeState;
  isPaused: boolean;
  driveSessionActive: boolean;
  driveDiscoveryOn: boolean;
  overlayKind?: LiveOverlay extends infer Overlay
    ? Overlay extends { kind: infer Kind }
      ? Kind
      : null
    : null;
};

export const guidedNavigationControlIds = ['pause_resume', 'transcript', 'end_tour'] as const;

export type ExploreHomeViewModel = {
  areaName: string;
  guideId: GuidePreference;
  guideName: string;
  guideLanguage: SupportedLocale;
  ambientCopy: string;
  primaryStatusLabel: string;
  secondaryActionLabel: string;
};

export function selectLiveForegroundPhase(input: LiveForegroundInput): LiveForegroundPhase {
  if (input.overlayKind === 'tour_preferences') {
    return 'guided_preferences';
  }

  if (input.mode === 'drive_discovery') {
    return input.driveSessionActive || input.driveDiscoveryOn ? 'drive_active' : 'drive_idle';
  }

  if (input.mode === 'city_explorer') {
    return 'explore_idle';
  }

  if (input.journeyState === 'completed') {
    return 'guided_tour_complete';
  }

  if (input.journeyState === 'arrived' || input.journeyState === 'at_target') {
    return 'guided_at_target';
  }

  if (input.journeyState === 'waiting_to_continue' || input.narrativeState === 'completed') {
    return 'guided_story_complete';
  }

  if (input.isPaused && input.narrativeState === 'arrival') {
    return 'guided_story_paused';
  }

  if (input.journeyState === 'narrating' || input.narrativeState === 'arrival') {
    return 'guided_story_active';
  }

  if (input.journeyState === 'approaching' || input.narrativeState === 'approach') {
    return 'guided_approaching';
  }

  return 'guided_navigating';
}

export function openTranscriptOverlay(returnPhase: LiveForegroundPhase): LiveOverlay {
  return { kind: 'transcript', returnPhase };
}

export function closeTranscriptOverlay(overlay: LiveOverlay): LiveForegroundPhase | null {
  return overlay?.kind === 'transcript' ? overlay.returnPhase : null;
}

export function shouldSyncPreferencesToTour(journeyState: JourneyState): boolean {
  return journeyState === 'idle' || journeyState === 'completed';
}

export function createExploreHomeViewModel(input: {
  areaName: string;
  guideId: GuidePreference;
  guideName: string;
  guideLanguage: SupportedLocale;
  ambientCopy: string;
}): ExploreHomeViewModel {
  return {
    ...input,
    primaryStatusLabel: 'Listening nearby',
    secondaryActionLabel: 'Choose a guided walk',
  };
}
