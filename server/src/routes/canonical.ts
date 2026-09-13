import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { getGuide } from '../services/guides';
import { getSession } from '../services/driveSession';
import {
  canonicalStoryEnd,
  canonicalSessionContext,
  canonicalSessionEnd,
  getPoiCandidates,
  startSession,
} from '../controllers/drive';
import { generateNarration, generateVoiceSample } from '../controllers/narration';

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);
sessionsRouter.post('/start', startSession);
sessionsRouter.put('/:sessionId/guide', async (req: AuthRequest, res, next) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session || session.userId !== req.user?.userId) { res.status(404).json({ error: 'Session not found' }); return; }
    const guide = await getGuide(String(req.body.guideId));
    if (!guide?.active) { res.status(400).json({ error: 'Guide is unavailable' }); return; }
    session.params.voiceId = guide.id;
    res.json({ ok: true });
  } catch (error) { next(error); }
});
sessionsRouter.post('/:sessionId/context', canonicalSessionContext);
sessionsRouter.post('/:sessionId/story/end', canonicalStoryEnd);
sessionsRouter.post('/:sessionId/end', canonicalSessionEnd);

export const discoveryRouter = Router();
discoveryRouter.use(requireAuth);
discoveryRouter.post('/active-poi', getPoiCandidates);

export const storiesRouter = Router();
storiesRouter.use(requireAuth);
storiesRouter.post('/generate', generateNarration);
storiesRouter.post('/voice-sample', generateVoiceSample);

export const poisRouter = Router();
poisRouter.use(requireAuth);
poisRouter.get('/nearby', (req, res, next) => {
  req.body = {
    lat: Number(req.query.lat),
    lng: Number(req.query.lng),
    heading: Number(req.query.heading ?? 0),
    speed: Number(req.query.speed ?? 40),
    themeTags:
      typeof req.query.theme === 'string' && req.query.theme.length > 0
        ? [req.query.theme]
        : ['mixed'],
  };
  void getPoiCandidates(req, res).catch(next);
});
