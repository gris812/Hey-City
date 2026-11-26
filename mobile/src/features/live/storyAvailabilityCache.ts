import type { StoryAvailabilityState } from '@heycity/shared';

type Level = 'short' | 'long';
type Outcome = Exclude<StoryAvailabilityState, 'unknown' | 'checking'>;
const maxTtlMs = 300_000;

export class StoryAvailabilityCache {
  private revision?: string;
  private entries = new Map<string, Partial<Record<Level, { status: Outcome; expiresAt: number }>>>();

  observeRevision(revision?: string) {
    if (!revision || revision === this.revision) return false;
    this.entries.clear();
    this.revision = revision;
    return true;
  }

  clear() { this.entries.clear(); this.revision = undefined; }

  record(id: string, level: Level, status: Outcome, ttl = maxTtlMs, now = Date.now()) {
    if (!Number.isFinite(ttl) || ttl <= 0) return;
    const current = this.entries.get(id) ?? {};
    if (!this.entries.has(id) && this.entries.size >= 128) this.entries.delete(this.entries.keys().next().value!);
    current[level] = { status, expiresAt: now + Math.min(ttl, maxTtlMs) };
    this.entries.set(id, current);
  }

  resetContinuation(id: string) {
    const entry = this.entries.get(id);
    if (entry) delete entry.long;
  }

  replacePreparedAudio(prepared?: { poiId: string; ttlMs: number }) {
    let changed = false;
    for (const [id, entry] of this.entries) {
      if (entry.short?.status !== 'ready' || id === prepared?.poiId) continue;
      delete entry.short;
      changed = true;
    }
    if (prepared && this.state(prepared.poiId) === 'unknown') {
      this.record(prepared.poiId, 'short', 'ready', prepared.ttlMs);
      changed = true;
    }
    return changed;
  }

  clearOutcome(id: string, level: Level) {
    const entry = this.entries.get(id);
    if (entry) delete entry[level];
  }

  state(id: string, level: Level = 'short', now = Date.now()): StoryAvailabilityState {
    const entry = this.entries.get(id)?.[level];
    return entry && entry.expiresAt > now ? entry.status : 'unknown';
  }

  unavailableIds() {
    return [...this.entries.keys()].filter(id => isStoryAutoSuppressed(this.state(id)));
  }

  expire(now = Date.now()) {
    let changed = false;
    for (const [id, entry] of this.entries) {
      for (const level of ['short', 'long'] as const) {
        if (entry[level] && entry[level].expiresAt <= now) {
          delete entry[level];
          changed = true;
        }
      }
      if (!entry.short && !entry.long) this.entries.delete(id);
    }
    return changed;
  }
}

export function isStoryAutoSuppressed(status: StoryAvailabilityState) {
  return status === 'unavailable' || status === 'temporary_failure' || status === 'text_only';
}
