import type { StoryAvailabilityState } from '@heycity/shared';
import type { LivePresentationState } from './livePresentation';
import type { CameraMotion } from './mapCamera';

export function shouldUseDrivePresentation(mode: LivePresentationState['movementMode'], sessionActive: boolean) {
  return mode === 'vehicle' || (mode === undefined && sessionActive);
}

export function needsCompactDriveType(width: number, fontScale: number) {
  return width / fontScale < 270;
}

export const driveStopFixAgeMs = 8_000;

export function canOpenDriveDetails(fix: CameraMotion | null | undefined, now: number) {
  if (!fix || fix.speedKmh == null || fix.accuracyMeters == null) return false;
  const age = now - fix.timestampMs;
  return age >= 0 && age < driveStopFixAgeMs &&
    fix.speedKmh >= 0 && fix.speedKmh < 1 && fix.accuracyMeters >= 0 && fix.accuracyMeters <= 30;
}

export function driveStory(state: Pick<LivePresentationState, 'playback' | 'playbackState' | 'audioProgress'>) {
  const { playback, playbackState: phase, audioProgress } = state;
  if (!playback || phase === 'idle' || phase === 'completed') return undefined;
  const transportActive = phase === 'playing' || phase === 'paused';
  return {
    title: playback.target.name,
    guideId: playback.guideId,
    phase,
    transportActive,
    hasText: Boolean(playback.transcript),
    progress: transportActive && audioProgress !== undefined && Number.isFinite(audioProgress)
      ? Math.round(Math.max(0, Math.min(1, audioProgress)) * 100)
      : undefined,
  };
}

export function drivePlaceAction(availability: StoryAvailabilityState) {
  return availability === 'ready' || availability === 'unknown';
}

export function isDriveMapSelectionRelevant(id: string, detailId: string | undefined, nearby: readonly { id: string }[], aheadId?: string) {
  return id === detailId || id === aheadId || nearby.some(place => place.id === id);
}

export function drivePlace<T>(options: { selected?: T; pinned?: T; ahead?: T; nearby?: T }) {
  if (options.selected) return { place: options.selected, relation: 'selected' } as const;
  if (options.pinned) return { place: options.pinned, relation: 'pinned' } as const;
  if (options.ahead) return { place: options.ahead, relation: 'ahead' } as const;
  if (options.nearby) return { place: options.nearby, relation: 'nearby' } as const;
  return undefined;
}

export function driveCategory(type: string | undefined) {
  switch (type) {
    case 'city': case 'town': case 'locality': return 'city';
    case 'region': return 'region';
    case 'museum': return 'museum';
    case 'monument': return 'monument';
    case 'historical_landmark': return 'historic';
    case 'cultural_landmark': return 'cultural';
    case 'visitor_center': return 'visitor';
    case 'national_park': case 'state_park': case 'park': return 'park';
    case 'industrial_landmark': return 'industrial';
    case 'natural_feature': return 'nature';
    case 'bridge': return 'bridge';
    case 'university': return 'university';
    default: return 'place';
  }
}
