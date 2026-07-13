import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  canonicalStoryEnd,
  canonicalSessionContext,
  canonicalSessionEnd,
  getPoiCandidates,
  startSession,
} from '../controllers/drive';
import { generateNarration } from '../controllers/narration';

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);
sessionsRouter.post('/start', startSession);
sessionsRouter.post('/:sessionId/context', canonicalSessionContext);
sessionsRouter.post('/:sessionId/story/end', canonicalStoryEnd);
sessionsRouter.post('/:sessionId/end', canonicalSessionEnd);

export const discoveryRouter = Router();
discoveryRouter.use(requireAuth);
discoveryRouter.post('/active-poi', getPoiCandidates);

export const storiesRouter = Router();
storiesRouter.use(requireAuth);
storiesRouter.post('/generate', generateNarration);

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
