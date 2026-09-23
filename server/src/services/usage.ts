import { databaseEnabled, query } from './database';
import { requestContext } from './requestContext';

export interface UsageEvent {
  userId?: string;
  category: 'auth' | 'google_maps' | 'openai_text' | 'openai_tts' | 'ai' | 'product';
  operation: string;
  quantity?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  metadata?: Record<string, unknown>;
}

export type ExperienceTelemetryOperation =
  | 'experience_decision'
  | 'story_started'
  | 'story_outcome'
  | 'callback_used';

export interface ExperienceDecisionEvent {
  sessionId: string;
  at: string;
  context: {
    movementMode: 'walking' | 'vehicle';
    locationBucket: string;
    headingBucket?: number;
    speedBucket?: string;
    areaType?: string;
    candidateDensity: number;
  };
  candidates: Array<{
    id: string;
    targetType?: string;
    distanceBucket?: string;
    score?: number;
    excludedReason?: string;
  }>;
  decision: {
    type: 'hold' | 'trigger_story';
    selectedTargetId?: string;
    triggerReason?: string;
    holdReason?: string;
    momentRelationship?: string;
  };
  outcome?: {
    completed?: boolean;
    skipped?: boolean;
    paused?: boolean;
    superseded?: boolean;
    askedMore?: boolean;
    askedQuestion?: boolean;
    listenedSeconds?: number;
  };
}

const memoryEvents: Array<UsageEvent & { createdAt: string }> = [];

export async function recordUsage(event: UsageEvent): Promise<void> {
  const userId = event.userId ?? requestContext.getStore()?.userId;
  event = { ...event, userId: isGuestUserId(userId) ? undefined : userId };
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

/** Records the canonical M2 event shape through the product telemetry boundary. */
export async function recordExperienceDecision(
  event: ExperienceDecisionEvent,
  userId?: string
): Promise<void> {
  await recordExperienceEvent('experience_decision', event, userId);
}

/**
 * Uses the same allow-listed representation for every M2 lifecycle operation.
 * This deliberately excludes coordinates, narration text, and unknown fields.
 */
export async function recordExperienceEvent(
  operation: ExperienceTelemetryOperation,
  event: ExperienceDecisionEvent,
  userId?: string
): Promise<void> {
  await recordUsage({
    userId,
    category: 'product',
    operation,
    metadata: sanitizeExperienceDecisionEvent(event),
  });
}

const MAX_EXPERIENCE_CANDIDATES = 20;
const MAX_EXPERIENCE_TEXT_LENGTH = 120;

function sanitizeExperienceDecisionEvent(event: ExperienceDecisionEvent): Record<string, unknown> {
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' ? value.slice(0, MAX_EXPERIENCE_TEXT_LENGTH) : undefined;
  const finiteNumber = (value: unknown, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;
  const boolean = (value: unknown): boolean | undefined => typeof value === 'boolean' ? value : undefined;
  const optional = <T>(key: string, value: T | undefined, target: Record<string, T>): void => {
    if (value !== undefined) target[key] = value;
  };

  const context: Record<string, unknown> = {
    movementMode: event.context.movementMode,
    locationBucket: text(event.context.locationBucket) ?? 'unknown',
    candidateDensity: finiteNumber(event.context.candidateDensity, 0, 10000) ?? 0,
  };
  optional('headingBucket', finiteNumber(event.context.headingBucket, 0, 360), context);
  optional('speedBucket', text(event.context.speedBucket), context);
  optional('areaType', text(event.context.areaType), context);

  const candidates = event.candidates.slice(0, MAX_EXPERIENCE_CANDIDATES).map((candidate) => {
    const safe: Record<string, unknown> = { id: text(candidate.id) ?? 'unknown' };
    optional('targetType', text(candidate.targetType), safe);
    optional('distanceBucket', text(candidate.distanceBucket), safe);
    optional('score', finiteNumber(candidate.score), safe);
    optional('excludedReason', text(candidate.excludedReason), safe);
    return safe;
  });

  const decision: Record<string, unknown> = { type: event.decision.type };
  optional('selectedTargetId', text(event.decision.selectedTargetId), decision);
  optional('triggerReason', text(event.decision.triggerReason), decision);
  optional('holdReason', text(event.decision.holdReason), decision);
  optional('momentRelationship', text(event.decision.momentRelationship), decision);

  const metadata: Record<string, unknown> = {
    sessionId: text(event.sessionId) ?? 'unknown',
    at: text(event.at) ?? new Date().toISOString(),
    context,
    candidates,
    decision,
  };
  if (event.outcome) {
    const outcome: Record<string, unknown> = {};
    for (const key of ['completed', 'skipped', 'paused', 'superseded', 'askedMore', 'askedQuestion'] as const) {
      optional(key, boolean(event.outcome[key]), outcome);
    }
    optional('listenedSeconds', finiteNumber(event.outcome.listenedSeconds, 0, 86400), outcome);
    metadata.outcome = outcome;
  }
  return metadata;
}

function isGuestUserId(userId: string | undefined): boolean {
  return typeof userId === 'string' && userId.startsWith('guest_');
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
  const [unassigned] = await query<{ cost: string }>(`SELECT coalesce(sum(estimated_cost_usd),0)::text AS cost FROM usage_events WHERE user_id IS NULL AND created_at >= now()-($1*interval '1 day')`, [days]);
  return { periodDays: days, users: Number(users?.total ?? 0), activeUsers: Number(users?.active ?? 0), totals, unassignedCostUsd: Number(unassigned?.cost ?? 0) };
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
