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
driveRouter.post('/poi/candidates', getPoiCandidates);
