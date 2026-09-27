import { Router } from 'express';
import {
  finishActiveStoryHandler,
  forceAheadDiscoveryRefresh,
  getPoiCandidates,
  pingSessionHandler,
  startSession,
  stopSessionHandler,
} from '../controllers/drive';
import rateLimit from 'express-rate-limit';
import { requireAuthOrGuest } from '../middleware/auth';
import {
  conversationCancelHandler,
  conversationInterruptHandler,
  conversationResumeHandler,
  conversationTurnHandler,
} from '../controllers/conversation';

export const driveRouter = Router();

driveRouter.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
  })
);
driveRouter.use(requireAuthOrGuest);

driveRouter.post('/session/start', startSession);
driveRouter.post('/session/stop', stopSessionHandler);
driveRouter.post('/session/ping', pingSessionHandler);
driveRouter.post('/session/ahead-discovery/refresh', forceAheadDiscoveryRefresh);
driveRouter.post('/session/story/finish', finishActiveStoryHandler);
// Guest-compatible aliases use the same session-owned runtime as canonical routes.
driveRouter.post('/session/conversation/interrupt', conversationInterruptHandler);
driveRouter.post('/session/conversation/turn', conversationTurnHandler);
driveRouter.post('/session/conversation/resume', conversationResumeHandler);
driveRouter.post('/session/conversation/cancel', conversationCancelHandler);
driveRouter.post('/poi/candidates', getPoiCandidates);
