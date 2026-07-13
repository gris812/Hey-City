import { Router } from 'express';
import { generateNarration, listVoices } from '../controllers/narration';
import { requireAuth } from '../middleware/auth';

export const narrationRouter = Router();

narrationRouter.get('/voices', listVoices);

narrationRouter.use(requireAuth);
narrationRouter.post('/generate', generateNarration);
