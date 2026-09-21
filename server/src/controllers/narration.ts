import { getGuide } from '../services/guides';
import { InsufficientEvidenceError } from '../services/evidence';
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { generateNarration as generate, generateVoiceSample as generateSample } from '../services/narration';

const VOICES = [
  { voiceId: 'default', displayName: 'Default', lang: 'ru', gender: 'female', providerVoiceName: 'default', sampleUrl: '' },
  { voiceId: 'ru-m', displayName: 'Мужской (RU)', lang: 'ru', gender: 'male', providerVoiceName: 'ru-RU', sampleUrl: '' },
  { voiceId: 'en-f', displayName: 'Female (EN)', lang: 'en', gender: 'female', providerVoiceName: 'en-US', sampleUrl: '' },
  { voiceId: 'en-m', displayName: 'Male (EN)', lang: 'en', gender: 'male', providerVoiceName: 'en-US', sampleUrl: '' },
];

export async function listVoices(_req: Request, res: Response): Promise<void> {
  res.json({ voices: VOICES });
}

export async function generateNarration(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { poiId, lang, theme, style, lengthSec, voiceId, context } = req.body || {};
  if (!poiId || !lang) {
    res.status(400).json({ error: 'poiId and lang required' });
    return;
  }

  try {
    const result = await generate({
      poiId,
      placeName: poiId,
      lang,
      theme: theme ?? 'mixed',
      style: style ?? 'documentary',
      lengthSec: typeof lengthSec === 'number' ? lengthSec : 90,
      voiceId: voiceId ?? 'default',
      context: context ?? 'drive_discovery',
      userId: req.user.userId,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof InsufficientEvidenceError) { res.status(422).json({ error: e.message }); return; }
    console.error('generateNarration', e);
    res.status(500).json({ error: 'Narration failed' });
  }
}

export async function generateVoiceSample(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const lang = req.body?.lang === 'en' ? 'en' : 'ru';
  try {
    const guide = await getGuide(String(req.body?.voiceId || 'dana'));
    if (!guide?.active) { res.status(400).json({ error: 'Guide is unavailable' }); return; }
    res.json(await generateSample(guide[lang].greeting, guide.id, lang, req.user.userId));
  } catch (error) {
    console.error('generateVoiceSample', error);
    res.status(500).json({ error: 'Voice sample failed' });
  }
}
