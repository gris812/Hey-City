import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { conversationService, ConversationTurnSupersededError } from '../services/conversationService';
import { getSession } from '../services/driveSession';

function ownedSession(req: AuthRequest, res: Response) {
  const sessionId = req.params.sessionId || req.body?.sessionId;
  if (!req.user || typeof sessionId !== 'string') {
    res.status(req.user ? 400 : 401).json({ error: req.user ? 'sessionId required' : 'Unauthorized' });
    return null;
  }
  const session = getSession(sessionId);
  if (!session || session.userId !== req.user.userId) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  return session;
}

export async function conversationInterruptHandler(req: AuthRequest, res: Response): Promise<void> {
  const session = ownedSession(req, res);
  if (!session) return;
  const momentId = req.body?.momentId;
  if (typeof momentId !== 'string' || !momentId) {
    res.status(400).json({ error: 'momentId required' });
    return;
  }
  const listenedSeconds = typeof req.body?.listenedSeconds === 'number' && Number.isFinite(req.body.listenedSeconds)
    ? req.body.listenedSeconds : undefined;
  const result = await conversationService.interrupt(session, { momentId, listenedSeconds });
  res.status(result.ok ? 200 : 409).json(result);
}

export async function conversationTurnHandler(req: AuthRequest, res: Response): Promise<void> {
  const session = ownedSession(req, res);
  if (!session) return;
  if (typeof req.body?.text !== 'string' || !req.body.text.trim()) {
    res.status(400).json({ error: 'text required' });
    return;
  }
  try {
    res.json(await conversationService.turn(session, {
      text: req.body.text,
      clientTurnId: typeof req.body.clientTurnId === 'string' ? req.body.clientTurnId : undefined,
      selectedResultId: typeof req.body.selectedResultId === 'string' ? req.body.selectedResultId : undefined,
    }));
  } catch (error) {
    if (error instanceof ConversationTurnSupersededError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
}

export function conversationResumeHandler(req: AuthRequest, res: Response): void {
  const session = ownedSession(req, res);
  if (!session) return;
  const momentId = req.body?.momentId;
  if (typeof momentId !== 'string' || !momentId) {
    res.status(400).json({ error: 'momentId required' });
    return;
  }
  const result = conversationService.resume(session, momentId);
  res.status(result.ok ? 200 : 409).json(result);
}

export function conversationCancelHandler(req: AuthRequest, res: Response): void {
  const session = ownedSession(req, res);
  if (!session) return;
  const result = conversationService.cancel(session, {
    turnId: typeof req.body?.turnId === 'string' ? req.body.turnId : undefined,
  });
  res.status(result.ok ? 200 : 409).json(result);
}
