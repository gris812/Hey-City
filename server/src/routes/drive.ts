import { Router } from 'express';
import {
  finishActiveStoryHandler,
  getPoiCandidates,
  pingSessionHandler,
  startSession,
  stopSessionHandler,
} from '../controllers/drive';
import { requireAuth } from '../middleware/auth';

export const driveRouter = Router();

driveRouter.use(requireAuth);

driveRouter.post('/session/start', startSession);
driveRouter.post('/session/stop', stopSessionHandler);
driveRouter.post('/session/ping', pingSessionHandler);
driveRouter.post('/session/story/finish', finishActiveStoryHandler);
driveRouter.post('/poi/candidates', getPoiCandidates);
