import { databaseEnabled, query } from './database';

export interface UsageEvent {
  userId?: string;
  category: 'auth' | 'google_maps' | 'openai_text' | 'openai_tts' | 'product';
  operation: string;
  quantity?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  metadata?: Record<string, unknown>;
}

const memoryEvents: Array<UsageEvent & { createdAt: string }> = [];

export async function recordUsage(event: UsageEvent): Promise<void> {
  if (!databaseEnabled()) {
    memoryEvents.push({ ...event, createdAt: new Date().toISOString() });
    return;
  }
  await query(
    `INSERT INTO usage_events
      (user_id, category, operation, quantity, input_tokens, output_tokens, estimated_cost_usd, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [event.userId ?? null, event.category, event.operation, event.quantity ?? 1,
      event.inputTokens ?? 0, event.outputTokens ?? 0, event.estimatedCostUsd ?? 0,
      JSON.stringify(event.metadata ?? {})]
  );
}

export async function adminSummary(days = 30): Promise<Record<string, unknown>> {
  if (!databaseEnabled()) {
    const cutoff = Date.now() - days * 86400000;
    const events = memoryEvents.filter((event) => new Date(event.createdAt).getTime() >= cutoff);
    return { periodDays: days, users: 0, activeUsers: new Set(events.map((e) => e.userId).filter(Boolean)).size, events: events.length, totals: [] };
  }
  const [users] = await query<{ total: string; active: string }>(
    `SELECT count(*)::text AS total,
      count(*) FILTER (WHERE last_seen_at >= now() - ($1 * interval '1 day'))::text AS active FROM users`, [days]
  );
  const totals = await query<{ category: string; operation: string; quantity: string; input_tokens: string; output_tokens: string; estimated_cost_usd: string }>(
    `SELECT category, operation, sum(quantity)::text AS quantity,
      sum(input_tokens)::text AS input_tokens, sum(output_tokens)::text AS output_tokens,
      sum(estimated_cost_usd)::text AS estimated_cost_usd
     FROM usage_events WHERE created_at >= now() - ($1 * interval '1 day')
     GROUP BY category, operation ORDER BY category, operation`, [days]
  );
  return { periodDays: days, users: Number(users?.total ?? 0), activeUsers: Number(users?.active ?? 0), totals };
}

export async function adminUsers(limit = 100): Promise<unknown[]> {
  if (!databaseEnabled()) return [];
  return query(
    `SELECT u.id, u.email, u.created_at, u.last_seen_at,
       coalesce(h.objects_viewed,0)::int AS objects_viewed,
       coalesce(e.tokens,0)::int AS tokens,
       coalesce(e.estimated_cost_usd,0)::numeric(14,6) AS estimated_cost_usd
     FROM users u
     LEFT JOIN (SELECT user_id,count(*) AS objects_viewed FROM history_items WHERE type='poi_listened' GROUP BY user_id) h ON h.user_id=u.id
     LEFT JOIN (SELECT user_id,sum(input_tokens+output_tokens) AS tokens,sum(estimated_cost_usd) AS estimated_cost_usd FROM usage_events GROUP BY user_id) e ON e.user_id=u.id
     ORDER BY u.last_seen_at DESC LIMIT $1`, [limit]
  );
}
