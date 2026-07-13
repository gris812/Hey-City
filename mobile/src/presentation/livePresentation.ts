export type DiscoveryPhase =
  | 'idle'
  | 'exploring'
  | 'approaching'
  | 'target_active'
  | 'holding';

export type PlaybackState =
  | 'idle'
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

export type LivePresentationState = {
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
