export type DiscoveryPhase =
  | 'idle'
  | 'exploring'
  | 'approaching'
  | 'target_active'
  | 'holding';

export type PlaybackState =
  | 'idle'
  | 'preparing'
  | 'text_only'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'error';

export type PresentationMode = 'map' | 'approach' | 'media';

export type GuideId = 'dana' | 'arthur';

export type DiscoveryTargetSummary = {
  id?: string;
  name: string;
  type?: string;
  latitude?: number;
  longitude?: number;
};

/** Native playback identity is local media state, not a second JourneyState. */
export type StoryPlaybackIdentity = {
  sessionId: string;
  momentId: string;
  poiId: string;
  guideId: GuideId;
  target: DiscoveryTargetSummary;
  transcript?: string;
  storyDiscoveries?: import('@heycity/shared').StoryDiscovery[];
};

export type LivePresentationState = {
  movementMode?: 'walking' | 'vehicle';
  playback?: StoryPlaybackIdentity;
  discoveryPhase: DiscoveryPhase;
  playbackState: PlaybackState;
  activeTarget?: DiscoveryTargetSummary;
  activeGuideId: GuideId;
  presentationMode: PresentationMode;
  transcriptPreview?: string;
  audioProgress?: number;
  holdReason?: string;
};

export const guideLabels: Record<GuideId, string> = {
  dana: 'Dana',
  arthur: 'Arthur',
};

/** The main Explore card follows the current story while native audio owns playback. */
export function explorePlaybackTarget(state: Pick<LivePresentationState, 'playback' | 'playbackState'>) {
  const { playback, playbackState } = state;
  if (!playback || !['loading', 'playing', 'paused'].includes(playbackState)) return undefined;
  const { latitude, longitude, name } = playback.target;
  if (latitude === undefined || longitude === undefined) return undefined;
  return { id: playback.poiId, title: name, coordinate: { latitude, longitude } };
}
