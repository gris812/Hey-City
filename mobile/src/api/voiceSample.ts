import { apiFetch } from './client';
import { config } from '../config';
import { toDriveBackendVoiceId, type CanonicalGuideId } from '../localization/guideIds';

export type VoiceSampleResult = {
  audioUrl: string;
  transcriptText: string;
};

function guestHeaders(guestId?: string): Record<string, string> | undefined {
  return guestId ? { 'x-hey-city-guest-id': guestId } : undefined;
}

export function resolveVoiceSampleUrl(audioUrl: string, apiBase = config.apiBase): string {
  const trimmed = audioUrl.trim();
  if (!trimmed) throw new Error('Voice sample did not return an audio URL.');

  if (trimmed.startsWith('/')) return `${apiBase.replace(/\/$/, '')}${trimmed}`;

  try {
    const parsed = new URL(trimmed);
    const loopback =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';
    if (!loopback) return trimmed;
    return `${apiBase.replace(/\/$/, '')}${parsed.pathname}${parsed.search}`;
  } catch {
    throw new Error('Voice sample returned an invalid audio URL.');
  }
}

export async function requestGuideVoiceSample(
  guideId: CanonicalGuideId,
  language: 'en' | 'ru',
  guestId?: string,
): Promise<VoiceSampleResult> {
  return apiFetch('/stories/voice-sample', {
    method: 'POST',
    headers: guestHeaders(guestId),
    body: {
      voiceId: toDriveBackendVoiceId(guideId),
      lang: language,
    },
  });
}
