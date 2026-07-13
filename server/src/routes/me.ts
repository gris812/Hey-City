import { Router } from 'express';
import { getProfile, updateProfile, updatePrivacy, deleteHistory, deleteHistoryItems } from '../controllers/me';
import { requireAuth } from '../middleware/auth';

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get('/', getProfile);
meRouter.put('/', updateProfile);
meRouter.put('/privacy', updatePrivacy);
meRouter.delete('/history', deleteHistory);
meRouter.delete('/history/items', deleteHistoryItems);
