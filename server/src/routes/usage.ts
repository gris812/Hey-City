import { Router } from 'express';
import { googleMaps } from '../config';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { recordUsage } from '../services/usage';
import { recordActivity } from '../services/activity';

export const usageRouter = Router();
usageRouter.use(requireAuth);
usageRouter.post('/activity', async (req: AuthRequest, res, next) => {
  try { await recordActivity(req.user!.userId, req.body); res.json({ ok: true }); }
  catch (error) { if (/Invalid activity|Guide is unavailable/.test((error as Error).message)) res.status(400).json({ error: (error as Error).message }); else next(error); }
});
usageRouter.post('/client', async (req: AuthRequest, res, next) => {
  try {
    if (req.body?.operation !== 'dynamic_map_load') {
      res.status(400).json({ error: 'Unsupported client usage operation' });
      return;
    }
    await recordUsage({ userId: req.user?.userId, category: 'google_maps', operation: 'dynamic_map_load',
      estimatedCostUsd: googleMaps.dynamicMapUsdPerThousand / 1000 });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
