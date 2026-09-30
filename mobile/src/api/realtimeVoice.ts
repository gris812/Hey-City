import type {
  RealtimeUserTurn,
  RealtimeVoiceConnectRequest,
  RealtimeVoiceConnectResult,
  RealtimeVoiceControlResult,
  RealtimeVoiceFallbackResult,
  RealtimeVoiceTurnResult,
  RealtimeVoiceUsageReport,
} from '@heycity/shared';
import { apiFetch } from './client';

function guestHeaders(guestId?: string): Record<string, string> | undefined {
  return guestId ? { 'x-hey-city-guest-id': guestId } : undefined;
}

export function connectRealtimeVoice(
  sessionId: string,
  request: RealtimeVoiceConnectRequest,
  guestId?: string,
): Promise<RealtimeVoiceConnectResult> {
  return apiFetch(`/sessions/${sessionId}/realtime-voice/connect`, {
    method: 'POST', headers: guestHeaders(guestId), body: request,
  });
}

export function submitRealtimeVoiceTurn(
  sessionId: string,
  turn: RealtimeUserTurn,
  guestId?: string,
): Promise<RealtimeVoiceTurnResult> {
  return apiFetch(`/sessions/${sessionId}/realtime-voice/turn`, {
    method: 'POST', headers: guestHeaders(guestId), body: turn,
  });
}

export function bargeInRealtimeVoice(
  sessionId: string,
  guestId?: string,
): Promise<RealtimeVoiceControlResult> {
  return apiFetch(`/sessions/${sessionId}/realtime-voice/barge-in`, {
    method: 'POST', headers: guestHeaders(guestId), body: {},
  });
}

export function closeRealtimeVoice(
  sessionId: string,
  guestId?: string,
): Promise<RealtimeVoiceControlResult> {
  return apiFetch(`/sessions/${sessionId}/realtime-voice/close`, {
    method: 'POST', headers: guestHeaders(guestId), body: {},
  });
}

export function reportRealtimeVoiceUsage(
  sessionId: string,
  report: RealtimeVoiceUsageReport,
  guestId?: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/sessions/${sessionId}/realtime-voice/usage`, {
    method: 'POST', headers: guestHeaders(guestId), body: report,
  });
}

export function requestRealtimeVoiceFallback(
  sessionId: string,
  input: { generation: number; voiceTurnId: string },
): Promise<RealtimeVoiceFallbackResult> {
  return apiFetch(`/sessions/${sessionId}/realtime-voice/fallback`, {
    method: 'POST', body: input,
  });
}
