import type {
  DrivePingResult,
  StoryFinishReason,
  StoryFinishResult,
} from '@heycity/shared';
import { apiFetch } from './client';

export type PingResult = DrivePingResult;
export type { StoryFinishReason, StoryFinishResult };

export async function startDriveSession(params: {
  themeTags?: string[];
  narrationStyle?: string;
  lengthSec?: number;
  leadTimeMin?: number;
  voiceId?: string;
  language?: string;
  autoplay?: boolean;
}): Promise<{ sessionId: string }> {
  return apiFetch('/drive/session/start', { method: 'POST', body: params });
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
