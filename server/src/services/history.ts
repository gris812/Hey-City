import { randomUUID } from 'node:crypto';
import { databaseEnabled, query } from './database';
import { recordUsage } from './usage';

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
  const list = await getHistory(userId);
  const cutoff = Date.now() - withinHours * 60 * 60 * 1000;
  return list.some(
    (h) =>
      (h.type === 'poi_listened' && (h.placeId === placeId || h.poiId === placeId)) &&
      new Date(h.timestamp).getTime() >= cutoff
  );
}
