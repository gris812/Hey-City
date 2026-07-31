import type { StoryFinishReason } from '@heycity/shared';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getUserById } from '../services/user';
import {
  createSession,
  finishActiveStory,
  getSession,
  stopSession,
  pingSession,
  DriveSessionParams,
} from '../services/driveSession';
import { findLocalPoiCandidates, localCandidateToNearbyPlace } from '../services/localPoi';

export async function startSession(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const isGuest = req.user.userId.startsWith('guest_');
  const user = isGuest ? null : await getUserById(req.user.userId);
  if (!isGuest && !user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const body = req.body || {};
  const lang =
    !user || user.driveDiscovery.languageDefault === 'auto'
      ? 'ru'
      : user.driveDiscovery.languageDefault;
  const params: DriveSessionParams = {
    themeTags: Array.isArray(body.themeTags) ? body.themeTags : user?.driveDiscovery.themeTags ?? ['mixed'],
    narrationStyle: body.narrationStyle ?? user?.driveDiscovery.narrationStyle ?? 'documentary',
    lengthSec: typeof body.lengthSec === 'number' ? body.lengthSec : user?.driveDiscovery.lengthSec ?? 90,
    leadTimeMin: typeof body.leadTimeMin === 'number' ? body.leadTimeMin : user?.driveDiscovery.leadTimeMin ?? 2,
    voiceId: body.voiceId ?? user?.driveDiscovery.voiceId ?? 'dana',
    language: body.language ?? lang,
    autoplay: typeof body.autoplay === 'boolean' ? body.autoplay : user?.driveDiscovery.autoplay ?? true,
  };

  const session = createSession(req.user.userId, params);
  res.json({ sessionId: session.id });
}

export async function stopSessionHandler(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const sessionId = req.body?.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId required' });
    return;
  }
  const session = getSession(sessionId);
  if (!session || session.userId !== req.user.userId) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  stopSession(sessionId);
  res.json({ ok: true });
}

export async function pingSessionHandler(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { sessionId, lat, lng, heading, speed, timestamp, accuracyMeters, forceAheadRefresh } = req.body || {};
  if (
    typeof sessionId !== 'string' ||
    typeof lat !== 'number' ||
    typeof lng !== 'number'
  ) {
    res.status(400).json({ error: 'sessionId, lat, lng required' });
    return;
  }
  const session = getSession(sessionId);
  if (!session || session.userId !== req.user.userId) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const headingDeg = typeof heading === 'number' ? heading : null;
  const speedKmh = typeof speed === 'number' ? speed : 0;
  const ts = typeof timestamp === 'number' ? timestamp : Date.now();
  const accuracy = typeof accuracyMeters === 'number' ? accuracyMeters : undefined;

  const result = await pingSession(
    sessionId,
    lat,
    lng,
    headingDeg,
    speedKmh,
    ts,
    accuracy,
    forceAheadRefresh === true
  );

  res.json(result);
}

export async function forceAheadDiscoveryRefresh(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { sessionId, lat, lng, heading, speed, timestamp, accuracyMeters } = req.body || {};
  if (
    typeof sessionId !== 'string' ||
    typeof lat !== 'number' ||
    typeof lng !== 'number'
  ) {
    res.status(400).json({ error: 'sessionId, lat, lng required' });
    return;
  }
  const session = getSession(sessionId);
  if (!session || session.userId !== req.user.userId) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const result = await pingSession(
    sessionId,
    lat,
    lng,
    typeof heading === 'number' ? heading : null,
    typeof speed === 'number' ? speed : 0,
    typeof timestamp === 'number' ? timestamp : Date.now(),
    typeof accuracyMeters === 'number' ? accuracyMeters : undefined,
    true
  );
  res.json({ aheadDiscovery: result.aheadDiscovery });
}

export async function finishActiveStoryHandler(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const sessionId = req.body?.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId required' });
    return;
  }
  const session = getSession(sessionId);
  if (!session || session.userId !== req.user.userId) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const bodyReason = req.body?.reason;
  const reason: StoryFinishReason =
    bodyReason === 'skipped' || bodyReason === 'paused' || bodyReason === 'ended'
      ? bodyReason
      : 'ended';
  const result = finishActiveStory(sessionId, reason);
  res.json(result);
}

export async function canonicalSessionContext(req: AuthRequest, res: Response): Promise<void> {
  req.body = {
    ...req.body,
    sessionId: req.params.sessionId,
  };
  await pingSessionHandler(req, res);
}

export async function canonicalStoryEnd(req: AuthRequest, res: Response): Promise<void> {
  req.body = {
    ...req.body,
    sessionId: req.params.sessionId,
  };
  await finishActiveStoryHandler(req, res);
}

export async function canonicalSessionEnd(req: AuthRequest, res: Response): Promise<void> {
  req.body = {
    ...req.body,
    sessionId: req.params.sessionId,
  };
  await stopSessionHandler(req, res);
}

export async function getPoiCandidates(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { lat, lng, heading, speed, themeTags } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ error: 'lat, lng required' });
    return;
  }
  const headingDeg = typeof heading === 'number' ? heading : 0;
  const speedKmh = typeof speed === 'number' ? speed : 40;
  const tags = Array.isArray(themeTags) ? themeTags : ['mixed'];

  try {
    const candidates = findLocalPoiCandidates({
      lat,
      lng,
      speedKmh,
      themeTags: tags,
      limit: 6,
    }).map(localCandidateToNearbyPlace);
    res.json({ candidates });
  } catch (e) {
    console.error('getPoiCandidates', e, headingDeg);
    res.status(500).json({ error: 'Local POI seed unavailable' });
  }
}
