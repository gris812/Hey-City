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
  const voiceId = req.body?.voiceId === 'artur' || req.body?.voiceId === 'arthur' ? 'artur' : 'dana';
  const samples = {
    ru: {
      dana: 'Привет! Я Dana. Будем идти в вашем ритме — я заговорю, когда рядом появится место, которое действительно стоит заметить.',
      artur: 'Здравствуйте. Я Arthur. Вместе мы увидим, как история, архитектура и человеческие решения сформировали город вокруг нас.',
    },
    en: {
      dana: "Hi! I'm Dana. We'll move at your pace, and I'll speak when something nearby is genuinely worth noticing.",
      artur: "Hello. I'm Arthur. Together we'll see how history, architecture, and human decisions shaped the city around us.",
    },
  } as const;
  try {
    res.json(await generateSample(samples[lang][voiceId], voiceId, lang, req.user.userId));
  } catch (error) {
    console.error('generateVoiceSample', error);
    res.status(500).json({ error: 'Voice sample failed' });
  }
}
