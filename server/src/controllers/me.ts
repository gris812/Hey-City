import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getUserById, updateUser } from '../services/user';
import { addToHistory, deleteAllHistory, deleteHistoryByIds, getHistory } from '../services/history';

const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true' || process.env.NODE_ENV === 'development';

export async function getProfile(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  let user = await getUserById(req.user.userId);

  if (!user && AUTH_DISABLED) {
    // создаём дефолтного пользователя для dev-режима
    user = await updateUser(req.user.userId, {
      email: req.user.email,
      historyEnabled: false,
      languageDefault: 'auto',       // или 'ru'/'en' как у вас принято
      driveDiscovery: {
        enabled: true,              // подстрой под вашу схему
        theme: 'general',
        style: 'calm',
        lengthSec: 45,
        leadTimeMin: 2,
      },
    } as any);
  }

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  
  const history = user.historyEnabled ? await getHistory(req.user.userId) : [];
  res.json({ ...user, history });
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { languageDefault, driveDiscovery } = req.body || {};
  const patch: Record<string, unknown> = {};
  if (languageDefault !== undefined) patch.languageDefault = languageDefault;
  if (driveDiscovery !== undefined) patch.driveDiscovery = driveDiscovery;

  const user = await updateUser(req.user.userId, patch as Parameters<typeof updateUser>[1]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
}

export async function updatePrivacy(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const historyEnabled = req.body?.historyEnabled;
  if (typeof historyEnabled !== 'boolean') {
    res.status(400).json({ error: 'historyEnabled (boolean) required' });
    return;
  }
  const user = await updateUser(req.user.userId, { historyEnabled });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ historyEnabled: user.historyEnabled });
}

export async function deleteHistory(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  await deleteAllHistory(req.user.userId);
  res.json({ ok: true });
}

export async function deleteHistoryItems(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const ids = req.body?.ids;
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'ids (array) required' });
    return;
  }
  await deleteHistoryByIds(req.user.userId, ids);
  res.json({ ok: true });
}
