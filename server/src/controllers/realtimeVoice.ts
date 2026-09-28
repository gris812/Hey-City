import type { Response } from 'express';
import type {
  RealtimeTransportKind,
  RealtimeUserTurn as PublicRealtimeUserTurn,
  RealtimeVoiceUsageReport,
} from '@heycity/shared';
import type { AuthRequest } from '../middleware/auth';
import { conversationService } from '../services/conversationService';
import { getSession, type DriveSession } from '../services/driveSession';
import { getDefaultSpeechProvider } from '../services/narration';
import { RealtimeConversationBridge } from '../services/realtimeConversationBridge';
import {
  RealtimeVoiceSession,
  RealtimeVoiceTurnSupersededError,
} from '../services/realtimeVoiceSession';
import { getRealtimeProviderRouter } from '../voice/realtimeProviderRouter';

function ownedSession(req: AuthRequest, res: Response): DriveSession | null {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const session = getSession(req.params.sessionId);
  if (!session || session.userId !== req.user.userId) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  return session;
}

function voiceSession(session: DriveSession): RealtimeVoiceSession {
  if (session.realtimeVoiceSession) return session.realtimeVoiceSession;
  session.realtimeVoiceSession = new RealtimeVoiceSession(session, {
    providerRouter: getRealtimeProviderRouter(),
    bridge: new RealtimeConversationBridge(conversationService, getDefaultSpeechProvider()),
  });
  return session.realtimeVoiceSession;
}

export async function realtimeVoiceConnectHandler(req: AuthRequest, res: Response): Promise<void> {
  const session = ownedSession(req, res);
  if (!session) return;
  const transport = req.body?.transport;
  if (!isTransport(transport)) {
    res.status(400).json({ error: 'Valid transport required' });
    return;
  }
  const clientSdp = typeof req.body?.clientSdp === 'string' ? req.body.clientSdp : undefined;
  if (clientSdp && clientSdp.length > 64_000) {
    res.status(400).json({ error: 'clientSdp is too large' });
    return;
  }
  try {
    const result = await voiceSession(session).connect({ transport, clientSdp });
    res.json(result);
  } catch {
    res.status(503).json({ error: 'Realtime voice is temporarily unavailable' });
  }
}

export async function realtimeVoiceTurnHandler(req: AuthRequest, res: Response): Promise<void> {
  const session = ownedSession(req, res);
  if (!session) return;
  if (!session.realtimeVoiceSession) {
    res.status(409).json({ error: 'Realtime voice session is not connected' });
    return;
  }
  const turn = publicTurn(req.body);
  if (!turn) {
    res.status(400).json({ error: 'Valid realtime turn required' });
    return;
  }
  try {
    res.json(await session.realtimeVoiceSession.submitUserTurn(turn));
  } catch (error) {
    if (error instanceof RealtimeVoiceTurnSupersededError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
}

export async function realtimeVoiceBargeInHandler(req: AuthRequest, res: Response): Promise<void> {
  const session = ownedSession(req, res);
  if (!session) return;
  const realtime = session.realtimeVoiceSession;
  if (!realtime) {
    res.status(409).json({ error: 'Realtime voice session is not connected' });
    return;
  }
  res.json(await realtime.bargeIn());
}

export async function realtimeVoiceCloseHandler(req: AuthRequest, res: Response): Promise<void> {
  const session = ownedSession(req, res);
  if (!session) return;
  const realtime = session.realtimeVoiceSession;
  if (!realtime) {
    res.json({ ok: true, generation: 0, state: 'closed' });
    return;
  }
  await realtime.close('client_closed');
  const snapshot = realtime.snapshot();
  res.json({ ok: true, generation: snapshot.generation, state: snapshot.state });
}

export async function realtimeVoiceFallbackHandler(req: AuthRequest, res: Response): Promise<void> {
  const session = ownedSession(req, res);
  if (!session) return;
  const realtime = session.realtimeVoiceSession;
  if (!realtime) {
    res.status(409).json({ error: 'Realtime voice session is not connected' });
    return;
  }
  const generation = req.body?.generation;
  const voiceTurnId = req.body?.voiceTurnId;
  if (!Number.isInteger(generation) || generation < 0 || typeof voiceTurnId !== 'string' || !/^[a-z0-9_-]{1,200}$/i.test(voiceTurnId)) {
    res.status(400).json({ error: 'Valid realtime fallback identity required' });
    return;
  }
  try {
    res.json(await realtime.renderFallback({ generation, voiceTurnId }));
  } catch (error) {
    if (error instanceof RealtimeVoiceTurnSupersededError) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(503).json({ error: 'Fallback speech is temporarily unavailable' });
  }
}

export async function realtimeVoiceUsageHandler(req: AuthRequest, res: Response): Promise<void> {
  const session = ownedSession(req, res);
  if (!session) return;
  const realtime = session.realtimeVoiceSession;
  if (!realtime) {
    res.status(409).json({ error: 'Realtime voice session is not connected' });
    return;
  }
  const report = publicUsageReport(req.body);
  if (!report) {
    res.status(400).json({ error: 'Valid bounded realtime usage report required' });
    return;
  }
  const ok = await realtime.reportUsage({
    providerId: report.providerId,
    generation: report.generation,
    ...(report.voiceTurnId ? { voiceTurnId: report.voiceTurnId } : {}),
    ...(report.firstAudioLatencyMs !== undefined ? { firstAudioLatencyMs: report.firstAudioLatencyMs } : {}),
    usage: report,
  });
  res.status(ok ? 200 : 409).json({ ok });
}

function isTransport(value: unknown): value is RealtimeTransportKind {
  return value === 'webrtc' || value === 'websocket' || value === 'native';
}

function publicTurn(body: unknown): PublicRealtimeUserTurn | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  if (typeof value.voiceTurnId !== 'string' || !value.voiceTurnId || value.voiceTurnId.length > 200 ||
      typeof value.text !== 'string' || value.text.length > 1000 || typeof value.isFinal !== 'boolean' ||
      typeof value.startedAt !== 'string' || typeof value.providerId !== 'string') return null;
  return {
    voiceTurnId: value.voiceTurnId,
    text: value.text,
    isFinal: value.isFinal,
    startedAt: value.startedAt,
    ...(typeof value.endedAt === 'string' ? { endedAt: value.endedAt } : {}),
    providerId: value.providerId,
    ...(typeof value.providerConfidence === 'number' && Number.isFinite(value.providerConfidence)
      ? { providerConfidence: Math.max(0, Math.min(1, value.providerConfidence)) } : {}),
  };
}

function publicUsageReport(body: unknown): RealtimeVoiceUsageReport | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  if (typeof value.providerId !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(value.providerId) ||
      typeof value.generation !== 'number' || !Number.isInteger(value.generation) || value.generation < 0) return null;
  const report: RealtimeVoiceUsageReport = {
    providerId: value.providerId,
    generation: value.generation,
  };
  if (typeof value.voiceTurnId === 'string' && /^[a-z0-9_-]{1,200}$/i.test(value.voiceTurnId)) report.voiceTurnId = value.voiceTurnId;
  for (const key of ['firstAudioLatencyMs', 'inputTextTokens', 'outputTextTokens', 'inputAudioTokens', 'outputAudioTokens', 'inputAudioBytes', 'outputAudioBytes'] as const) {
    const amount = value[key];
    if (amount === undefined) continue;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
    report[key] = Math.min(Math.floor(amount), key === 'firstAudioLatencyMs' ? 600_000 : 1_000_000_000);
  }
  return report;
}
