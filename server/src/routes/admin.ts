import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { adminSummary, adminUsers } from '../services/usage';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { media } from '../config';
import { accountAnalytics } from '../services/activity';
import { archiveGuide, listGuides, saveGuide } from '../services/guides';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/accounts', async (req, res, next) => {
  try { const days = Math.max(1, Math.min(365, Number(req.query.days) || 30)); res.json({ users: await accountAnalytics(Math.round(days)) }); }
  catch (error) { next(error); }
});
adminRouter.get('/guides', async (_req, res, next) => {
  try { res.json({ guides: await listGuides(true) }); } catch (error) { next(error); }
});
adminRouter.put('/guides/:id', async (req, res, next) => {
  try { if (req.body.id !== req.params.id) { res.status(400).json({ error: 'Guide ID mismatch' }); return; } res.json({ guide: await saveGuide(req.body) }); }
  catch (error) { if (/Invalid|At least/.test((error as Error).message)) res.status(400).json({ error: (error as Error).message }); else next(error); }
});
adminRouter.delete('/guides/:id', async (req, res, next) => {
  try { await archiveGuide(req.params.id); res.json({ ok: true }); }
  catch (error) { if (/not found|At least/.test((error as Error).message)) res.status(400).json({ error: (error as Error).message }); else next(error); }
});
adminRouter.post('/guide-image', express.raw({ type: ['image/png', 'image/jpeg'], limit: '1mb' }), async (req, res, next) => {
  try {
    const bytes = req.body as Buffer;
    const png = Buffer.isBuffer(bytes) && bytes.length >= 33 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes.subarray(12, 16).toString() === 'IHDR' && bytes.readUInt32BE(16) <= 4096 && bytes.readUInt32BE(20) <= 4096 && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0;
    const jpeg = Buffer.isBuffer(bytes) && bytes.length > 100 && bytes.subarray(0, 3).toString('hex') === 'ffd8ff' && bytes.subarray(-2).toString('hex') === 'ffd9';
    if (!png && !jpeg) {
      res.status(400).json({ error: 'Upload a valid PNG or JPEG image' }); return;
    }
    const filename = `guide-${randomUUID()}.${png ? 'png' : 'jpg'}`;
    await mkdir(media.directory, { recursive: true });
    await writeFile(join(media.directory, filename), bytes, { flag: 'wx' });
    res.status(201).json({ path: `/media/${filename}` });
  } catch (error) { next(error); }
});

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
