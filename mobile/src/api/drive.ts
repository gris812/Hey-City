import type {
  DrivePingResult,
  StoryFinishReason,
  StoryFinishResult,
} from '@heycity/shared';
import { apiFetch } from './client';
import { toDriveBackendVoiceId, type CanonicalGuideId } from '../localization/guideIds';

export type PingResult = DrivePingResult;
export type { StoryFinishReason, StoryFinishResult };

export async function startDriveSession(params: {
  themeTags?: string[];
  narrationStyle?: string;
  lengthSec?: number;
  leadTimeMin?: number;
  voiceId?: string;
  guideId?: CanonicalGuideId;
  language?: string;
  autoplay?: boolean;
}): Promise<{ sessionId: string }> {
  const { guideId, ...body } = params;
  return apiFetch('/drive/session/start', {
    method: 'POST',
    body: {
      ...body,
      voiceId: guideId ? toDriveBackendVoiceId(guideId) : body.voiceId,
    },
  });
}

export async function stopDriveSession(sessionId: string): Promise<void> {
  await apiFetch('/drive/session/stop', { method: 'POST', body: { sessionId } });
}

export async function finishDriveStory(
  sessionId: string,
  reason: StoryFinishReason
): Promise<StoryFinishResult> {
  return apiFetch('/drive/session/story/finish', {
    method: 'POST',
    body: { sessionId, reason },
  });
}

export async function pingDriveSession(
  sessionId: string,
  lat: number,
  lng: number,
  heading: number,
  speed: number,
  timestamp: number
): Promise<PingResult> {
  return apiFetch<PingResult>('/drive/session/ping', {
    method: 'POST',
    body: { sessionId, lat, lng, heading, speed, timestamp },
  });
}
