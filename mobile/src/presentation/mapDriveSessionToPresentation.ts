import type { PingResult } from '../api/drive';
import { fromBackendGuideId } from '../localization/guideIds';
import type {
  DiscoveryPhase,
  DiscoveryTargetSummary,
  GuideId,
  LivePresentationState,
  PlaybackState,
  PresentationMode,
} from './livePresentation';

export type LocalPresentationSessionState = {
  sessionActive: boolean;
  playbackState: PlaybackState;
  audioProgress?: number;
};

const TRANSCRIPT_PREVIEW_LIMIT = 180;

export function mapDriveSessionToPresentation(
  result: PingResult | null,
  localState: LocalPresentationSessionState
): LivePresentationState {
  const activeTarget = getActiveTarget(result);
  const playbackState = getPlaybackState(result, localState);
  const discoveryPhase = getDiscoveryPhase(result, localState.sessionActive);

  return {
    discoveryPhase,
    playbackState,
    activeTarget,
    activeGuideId: getGuideId(result),
    presentationMode: getPresentationMode(discoveryPhase, playbackState),
    transcriptPreview: getTranscriptPreview(result),
    audioProgress: localState.audioProgress,
    holdReason: result?.decision?.type === 'hold' ? result.decision.reason : undefined,
  };
}

function getDiscoveryPhase(result: PingResult | null, sessionActive: boolean): DiscoveryPhase {
  if (!sessionActive) return 'idle';
  if (!result?.decision) return 'exploring';

  if (result.decision.type === 'trigger_story') {
    return result.nextAction === 'PLAY' ? 'target_active' : 'exploring';
  }

  if (result.decision.reason === 'already_listening') return 'target_active';
  return 'holding';
}

function getPlaybackState(
  result: PingResult | null,
  localState: LocalPresentationSessionState
): PlaybackState {
  if (!localState.sessionActive) return 'idle';
  if (localState.playbackState === 'error') return 'error';
  if (localState.playbackState === 'loading') return 'loading';
  if (localState.playbackState === 'paused') return 'paused';
  if (localState.playbackState === 'completed') return 'completed';
  if (result?.nextAction === 'PLAY') return 'playing';
  return localState.playbackState === 'playing' ? 'playing' : 'idle';
}

function getPresentationMode(
  _discoveryPhase: DiscoveryPhase,
  playbackState: PlaybackState
): PresentationMode {
  if (playbackState === 'playing' || playbackState === 'paused') return 'map';
  return 'map';
}

function getGuideId(result: PingResult | null): GuideId {
  return fromBackendGuideId(result?.narrativePlan?.guideId?.toLowerCase());
}

function getActiveTarget(result: PingResult | null): DiscoveryTargetSummary | undefined {
  if (result?.poi) {
    return {
      id: result.poi.place_id,
      name: result.poi.name,
      type: result.decision?.type === 'trigger_story' ? result.decision.mode : undefined,
      latitude: result.poi.geometry.location.lat,
      longitude: result.poi.geometry.location.lng,
    };
  }

  if (result?.narrativePlan?.placeName) {
    return {
      id: result.narrativePlan.poiId,
      name: result.narrativePlan.placeName,
      type: result.narrativePlan.mode,
    };
  }

  return undefined;
}

function getTranscriptPreview(result: PingResult | null): string | undefined {
  const text = result?.transcriptText ?? result?.textPreview;
  if (!text) return undefined;
  return text.length > TRANSCRIPT_PREVIEW_LIMIT
    ? `${text.slice(0, TRANSCRIPT_PREVIEW_LIMIT - 3)}...`
    : text;
}
