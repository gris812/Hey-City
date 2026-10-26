import type {
  DrivePingResult,
  StoryFinishReason,
  StoryFinishResult,
} from '@heycity/shared';
import { apiFetch } from './client';
import { toDriveBackendVoiceId, type CanonicalGuideId } from '../localization/guideIds';

export type PingResult = DrivePingResult;
export type { StoryFinishReason, StoryFinishResult };

function guestHeaders(guestId?: string): Record<string, string> | undefined {
  return guestId ? { 'x-hey-city-guest-id': guestId } : undefined;
}

export async function startDriveSession(params: {
  mode?: 'walking' | 'vehicle';
  autoMode?: boolean;
  themeTags?: string[];
  narrationStyle?: string;
  lengthSec?: number;
  leadTimeMin?: number;
  voiceId?: string;
  guideId?: CanonicalGuideId;
  language?: string;
  autoplay?: boolean;
  guestId?: string;
}): Promise<{ sessionId: string }> {
  const { guideId, guestId, ...body } = params;
  return apiFetch('/drive/session/start', {
    method: 'POST',
    headers: guestHeaders(guestId),
    body: {
      ...body,
      voiceId: guideId ? toDriveBackendVoiceId(guideId) : body.voiceId,
    },
  });
}

/** Canonical explicit story selection; no parallel narrative endpoint. */
export type SelectedStoryResult = {
  poiId: string;
  name: string;
  momentId?: string;
  audioUrl?: string;
  transcriptText: string;
  level: 'identify' | 'short' | 'long';
  language: 'ru' | 'en';
};

export async function selectDriveStory(
  sessionId: string, poiId: string, level: 'short' | 'long',
  language: 'ru' | 'en', guestId?: string,
): Promise<SelectedStoryResult> {
  return apiFetch<SelectedStoryResult>(`/sessions/${encodeURIComponent(sessionId)}/select`, {
    method: 'POST',
    headers: guestHeaders(guestId),
    body: { poiId, level, language },
  });
}

export async function stopDriveSession(sessionId: string, guestId?: string): Promise<void> {
  await apiFetch('/drive/session/stop', {
    method: 'POST',
    headers: guestHeaders(guestId),
    body: { sessionId },
  });
}

export async function finishDriveStory(
  sessionId: string,
  reason: StoryFinishReason,
  guestId?: string,
  momentId?: string,
): Promise<StoryFinishResult> {
  return apiFetch('/drive/session/story/finish', {
    method: 'POST',
    headers: guestHeaders(guestId),
    body: { sessionId, reason, momentId },
  });
}

export async function pingDriveSession(
  sessionId: string,
  lat: number,
  lng: number,
  heading: number | null,
  speed: number | null,
  timestamp: number,
  accuracyMeters?: number,
  forceAheadRefresh = false,
  guestId?: string
): Promise<PingResult> {
  return apiFetch<PingResult>('/drive/session/ping', {
    method: 'POST',
    headers: guestHeaders(guestId),
    body: { sessionId, lat, lng, heading, speed, timestamp, accuracyMeters, forceAheadRefresh },
  });
}

export async function forceAheadDiscoveryRefresh(params: {
  sessionId: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  accuracyMeters?: number;
  guestId?: string;
}): Promise<Pick<PingResult, 'aheadDiscovery'>> {
  const { guestId, ...body } = params;
  return apiFetch('/drive/session/ahead-discovery/refresh', {
    method: 'POST',
    headers: guestHeaders(guestId),
    body,
  });
}
