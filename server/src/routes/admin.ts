import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { adminSummary, adminUsers } from '../services/usage';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/summary', async (req, res, next) => {
  try {
    const raw = Number(req.query.days ?? 30);
    const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.round(raw))) : 30;
    res.json(await adminSummary(days));
  } catch (error) { next(error); }
});

adminRouter.get('/users', async (_req, res, next) => {
  try { res.json({ users: await adminUsers() }); }
  catch (error) { next(error); }
});
