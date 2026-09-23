import { randomUUID } from 'node:crypto';
import { databaseEnabled, query } from './database';
import { recordUsage } from './usage';
import { getUserById } from './user';

/**
 * History: trips, listened POI, saved items. MVP: in-memory; production: DB.
 */
export interface HistoryItem {
  id: string;
  userId: string;
  type: 'trip' | 'poi_listened' | 'saved_poi' | 'saved_route';
  poiId?: string;
  placeId?: string;
  mode?: string;
  theme?: string;
  style?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** Structured M2 fields stored on the existing compatible poi_listened record. */
export interface JourneyHistoryMetadata extends Record<string, unknown> {
  momentId: string;
  storyLevel?: string;
  outcome?: string;
  topicKeys?: string[];
  evidenceRefs?: string[];
  guideId?: string;
  area?: JourneyAreaSummary;
}

export interface JourneyAreaSummary {
  city?: string;
  locality?: string;
  neighborhood?: string;
  region?: string;
  areaType?: string;
  source?: string;
}

export interface JourneyHistoryInput {
  poiId?: string;
  placeId?: string;
  mode?: string;
  theme?: string;
  style?: string;
  metadata: JourneyHistoryMetadata;
}

const items = new Map<string, HistoryItem>();
const byUser = new Map<string, string[]>();

function nextId(): string {
  return `hist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function addToHistory(
  userId: string,
  item: Omit<HistoryItem, 'id' | 'userId' | 'timestamp'>
): Promise<HistoryItem> {
  const record: HistoryItem = {
    ...item,
    id: nextId(),
    userId,
    timestamp: new Date().toISOString(),
  };
  if (databaseEnabled()) {
    record.id = `hist_${randomUUID()}`;
    await query(`INSERT INTO history_items(id,user_id,type,poi_id,place_id,mode,theme,style,metadata,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [record.id, userId, record.type, record.poiId ?? null, record.placeId ?? null,
        record.mode ?? null, record.theme ?? null, record.style ?? null,
        JSON.stringify(record.metadata ?? {}), record.timestamp]);
    if (record.type === 'poi_listened') await recordUsage({ userId, category: 'product', operation: 'object_viewed' });
    return record;
  }
  items.set(record.id, record);
  const list = byUser.get(userId) ?? [];
  list.push(record.id);
  byUser.set(userId, list);
  if (record.type === 'poi_listened') await recordUsage({ userId, category: 'product', operation: 'object_viewed' });
  return record;
}

/**
 * Persists an M2 story moment only for signed-in users who have opted into
 * history. Guest continuity remains session-owned and is never written here.
 */
export async function recordJourneyHistory(
  userId: string,
  item: JourneyHistoryInput
): Promise<HistoryItem | undefined> {
  if (isGuestUserId(userId)) return undefined;
  if (item.metadata.outcome !== 'completed') return undefined;
  const user = await getUserById(userId);
  if (!user?.historyEnabled) return undefined;
  const metadata = sanitizeJourneyHistoryMetadata(item.metadata);
  if (!metadata) return undefined;

  return addToHistory(userId, {
    type: 'poi_listened',
    poiId: item.poiId,
    placeId: item.placeId,
    mode: item.mode,
    theme: item.theme,
    style: item.style,
    metadata,
  });
}

export async function getHistory(userId: string): Promise<HistoryItem[]> {
  if (databaseEnabled()) {
    const rows = await query<HistoryRow>(`SELECT id,user_id,type,poi_id,place_id,mode,theme,style,metadata,created_at
      FROM history_items WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    return rows.map(fromHistoryRow);
  }
  const ids = byUser.get(userId) ?? [];
  return ids.map((id) => items.get(id)).filter(Boolean) as HistoryItem[];
}

export async function deleteAllHistory(userId: string): Promise<void> {
  if (databaseEnabled()) {
    await query('DELETE FROM history_items WHERE user_id=$1', [userId]);
    return;
  }
  const ids = byUser.get(userId) ?? [];
  ids.forEach((id) => items.delete(id));
  byUser.set(userId, []);
}

export async function deleteHistoryByIds(userId: string, ids: string[]): Promise<void> {
  if (databaseEnabled()) {
    await query('DELETE FROM history_items WHERE user_id=$1 AND id=ANY($2::text[])', [userId, ids]);
    return;
  }
  const list = byUser.get(userId) ?? [];
  const set = new Set(ids);
  const next = list.filter((id) => {
    if (set.has(id)) {
      items.delete(id);
      return false;
    }
    return true;
  });
  byUser.set(userId, next);
}

interface HistoryRow {
  id: string; user_id: string; type: HistoryItem['type']; poi_id: string | null;
  place_id: string | null; mode: string | null; theme: string | null; style: string | null;
  metadata: Record<string, unknown>; created_at: Date | string;
}

function fromHistoryRow(row: HistoryRow): HistoryItem {
  return { id: row.id, userId: row.user_id, type: row.type, poiId: row.poi_id ?? undefined,
    placeId: row.place_id ?? undefined, mode: row.mode ?? undefined, theme: row.theme ?? undefined,
    style: row.style ?? undefined, metadata: row.metadata,
    timestamp: new Date(row.created_at).toISOString() };
}

export async function wasPoiListenedRecently(userId: string, placeId: string, withinHours: number): Promise<boolean> {
  if (isGuestUserId(userId)) return false;
  if (databaseEnabled()) {
    const [row] = await query<{ listened: boolean | string }>(
      `SELECT EXISTS(
         SELECT 1 FROM history_items
         WHERE user_id=$1
           AND type='poi_listened'
           AND (place_id=$2 OR poi_id=$2)
           AND created_at >= now() - ($3::numeric * interval '1 hour')
       ) AS listened`,
      [userId, placeId, Math.max(0, withinHours)]
    );
    return row?.listened === true || row?.listened === 'true';
  }
  const list = await getHistory(userId);
  const cutoff = Date.now() - withinHours * 60 * 60 * 1000;
  return list.some(
    (h) =>
      (h.type === 'poi_listened' && (h.placeId === placeId || h.poiId === placeId)) &&
      new Date(h.timestamp).getTime() >= cutoff
  );
}

function isGuestUserId(userId: string): boolean {
  return userId.startsWith('guest_');
}

const MAX_HISTORY_TEXT_LENGTH = 120;
const MAX_HISTORY_TOPICS = 12;
const MAX_HISTORY_EVIDENCE_REFS = 100;

function sanitizeJourneyHistoryMetadata(input: JourneyHistoryMetadata): JourneyHistoryMetadata | undefined {
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value.slice(0, MAX_HISTORY_TEXT_LENGTH) : undefined;
  const textList = (values: unknown, limit: number): string[] | undefined => {
    if (!Array.isArray(values)) return undefined;
    return values.filter((value): value is string => typeof value === 'string' && value.length > 0)
      .slice(0, limit)
      .map((value) => value.slice(0, MAX_HISTORY_TEXT_LENGTH));
  };
  const momentId = text(input.momentId);
  if (!momentId) return undefined;
  const metadata: JourneyHistoryMetadata = { momentId };
  const storyLevel = text(input.storyLevel);
  const outcome = text(input.outcome);
  const topicKeys = textList(input.topicKeys, MAX_HISTORY_TOPICS);
  const evidenceRefs = textList(input.evidenceRefs, MAX_HISTORY_EVIDENCE_REFS);
  const guideId = text(input.guideId);
  if (storyLevel !== undefined) metadata.storyLevel = storyLevel;
  if (outcome !== undefined) metadata.outcome = outcome;
  if (topicKeys !== undefined) metadata.topicKeys = topicKeys;
  if (evidenceRefs !== undefined) metadata.evidenceRefs = evidenceRefs;
  if (guideId !== undefined) metadata.guideId = guideId;
  if (input.area) {
    const area: JourneyAreaSummary = {};
    for (const key of ['city', 'locality', 'neighborhood', 'region', 'areaType', 'source'] as const) {
      const value = text(input.area[key]);
      if (value !== undefined) area[key] = value;
    }
    if (Object.keys(area).length > 0) metadata.area = area;
  }
  return metadata;
}
