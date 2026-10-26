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
