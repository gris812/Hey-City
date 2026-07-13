import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { generateNarration as generate } from '../services/narration';

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
    });
    res.json(result);
  } catch (e) {
    console.error('generateNarration', e);
    res.status(500).json({ error: 'Narration failed' });
  }
}
