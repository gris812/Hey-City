import { apiFetch } from './client';
import { toDriveBackendVoiceId, type CanonicalGuideId } from '../localization/guideIds';

export type VoiceSampleResult = {
  audioUrl: string;
  transcriptText: string;
};

function guestHeaders(guestId?: string): Record<string, string> | undefined {
  return guestId ? { 'x-hey-city-guest-id': guestId } : undefined;
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
