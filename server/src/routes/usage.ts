import { Router } from 'express';
import { googleMaps } from '../config';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { recordUsage } from '../services/usage';

export const usageRouter = Router();
usageRouter.use(requireAuth);
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
