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
  items.set(record.id, record);
  const list = byUser.get(userId) ?? [];
  list.push(record.id);
  byUser.set(userId, list);
  return record;
}

export async function getHistory(userId: string): Promise<HistoryItem[]> {
  const ids = byUser.get(userId) ?? [];
  return ids.map((id) => items.get(id)).filter(Boolean) as HistoryItem[];
}

export async function deleteAllHistory(userId: string): Promise<void> {
  const ids = byUser.get(userId) ?? [];
  ids.forEach((id) => items.delete(id));
  byUser.set(userId, []);
}

export async function deleteHistoryByIds(userId: string, ids: string[]): Promise<void> {
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

export async function wasPoiListenedRecently(userId: string, placeId: string, withinHours: number): Promise<boolean> {
  const list = await getHistory(userId);
  const cutoff = Date.now() - withinHours * 60 * 60 * 1000;
  return list.some(
    (h) =>
      (h.type === 'poi_listened' && (h.placeId === placeId || h.poiId === placeId)) &&
      new Date(h.timestamp).getTime() >= cutoff
  );
}
