import { createHash } from 'node:crypto';
import seeds from './guideSeeds.json';
import { databaseEnabled, query, transaction } from './database';

export interface GuideCopy { name: string; role: string; body: string; interests: string[]; greeting: string }
export interface Guide {
  id: string; avatar: string; image: string; active: boolean; order: number;
  voice: string; personality: string; voiceInstructions: string;
  ru: GuideCopy; en: GuideCopy;
}
const memory = new Map<string, Guide>(seeds.map(g => [g.id, g]));
export const allowedVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage', 'ash'];

export async function initializeGuides(): Promise<void> {
  if (!databaseEnabled()) return;
  for (const guide of seeds) await query('INSERT INTO guides(id,document) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING', [guide.id, JSON.stringify(guide)]);
}

export async function listGuides(all = false): Promise<Guide[]> {
  const rows = databaseEnabled() ? (await query<{ document: Guide }>('SELECT document FROM guides')).map(r => r.document) : [...memory.values()];
  return rows.filter(g => all || g.active).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export async function getGuide(id: string): Promise<Guide | undefined> {
  return (await listGuides(true)).find(g => g.id === (id === 'artur' ? 'arthur' : id));
}

export function guideVersion(g?: Guide): string {
  return createHash('sha256').update(JSON.stringify(g ?? {})).digest('hex').slice(0, 12);
}

export function validateGuide(value: unknown): Guide {
  const g = value as Guide;
  const text = (v: unknown, max: number, required = true) => typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0);
  const image = (v: unknown) => typeof v === 'string' && (/^\/assets\/[a-zA-Z0-9._-]+\.(png|webp|jpg)$/.test(v) || /^\/media\/guide-[a-f0-9-]+\.(png|jpg)$/.test(v));
  if (!g || !/^[a-z][a-z0-9_-]{1,39}$/.test(g.id) || typeof g.active !== 'boolean' || !Number.isInteger(g.order) || Math.abs(g.order) > 10000 || !image(g.avatar) || !image(g.image) || !allowedVoices.includes(g.voice) || !text(g.personality, 2000) || !text(g.voiceInstructions, 1000, false)) throw new Error('Invalid guide settings or images');
  for (const lang of ['ru', 'en'] as const) {
    const c = g[lang];
    if (!c || !text(c.name, 80) || !text(c.role, 120) || !text(c.body, 2000) || !text(c.greeting, 1000) || !Array.isArray(c.interests) || c.interests.length > 8 || !c.interests.every(s => text(s, 80))) throw new Error(`Invalid ${lang} guide description`);
  }
  return { id: g.id, avatar: g.avatar, image: g.image, active: g.active, order: g.order, voice: g.voice, personality: g.personality, voiceInstructions: g.voiceInstructions, ru: g.ru, en: g.en };
}

// Serialise publication changes so concurrent requests cannot remove the last guide.
export async function saveGuide(value: unknown): Promise<Guide> {
  const guide = validateGuide(value);
  if (!databaseEnabled()) {
    if (!guide.active && ![...memory.values()].some(g => g.id !== guide.id && g.active)) throw new Error('At least one published guide is required');
    memory.set(guide.id, guide); return guide;
  }
  return transaction(async run => {
    await run('SELECT pg_advisory_xact_lock(871401)');
    const others = await run("SELECT id FROM guides WHERE id <> $1 AND document->>'active' = 'true'", [guide.id]);
    if (!guide.active && !others.length) throw new Error('At least one published guide is required');
    await run('INSERT INTO guides(id,document) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET document=excluded.document,updated_at=now()', [guide.id, JSON.stringify(guide)]);
    return guide;
  });
}

export async function archiveGuide(id: string): Promise<void> {
  const guide = await getGuide(id);
  if (!guide) throw new Error('Guide not found');
  await saveGuide({ ...guide, active: false });
}
