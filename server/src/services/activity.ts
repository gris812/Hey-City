import { databaseEnabled, transaction, query } from './database';
import { getGuide } from './guides';

const MAX_GAP_SECONDS = 75;
const MIN_INTERVAL_SECONDS = 5;
export interface ActivityState { client_id: string; guide_id: string; last_at: string | Date; active: boolean; listening: boolean; listening_guide_id?: string }
export function activityDelta(previous: ActivityState | undefined, now: number, clientId: string): number {
  if (!previous || previous.client_id !== clientId || !previous.active) return 0;
  const gap = (now - new Date(previous.last_at).getTime()) / 1000;
  return gap >= MIN_INTERVAL_SECONDS && gap <= MAX_GAP_SECONDS ? gap : 0;
}

export async function recordActivity(userId: string, body: { clientId?: unknown; guideId?: unknown; active?: unknown; listening?: unknown; listeningGuideId?: unknown }): Promise<void> {
  if (typeof body.clientId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.clientId) || typeof body.guideId !== 'string' || typeof body.active !== 'boolean' || typeof body.listening !== 'boolean') throw new Error('Invalid activity');
  const guide = await getGuide(body.guideId);
  if (!guide?.active) throw new Error('Guide is unavailable');
  const listeningGuide = typeof body.listeningGuideId === 'string' ? await getGuide(body.listeningGuideId) : guide;
  if (!listeningGuide) throw new Error('Guide is unavailable');
  if (!databaseEnabled()) return;
  const clientId = body.clientId;
  await transaction(async run => {
    // User row lock also prevents two browser tabs counting the same interval twice.
    await run('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    await run('UPDATE users SET selected_guide_id=$2 WHERE id=$1', [userId, guide.id]);
    const [previous] = await run<ActivityState>('SELECT * FROM activity_state WHERE user_id=$1', [userId]);
    const now = Date.now();
    const elapsed = previous ? (now - new Date(previous.last_at).getTime()) / 1000 : Infinity;
    if (previous && elapsed < MIN_INTERVAL_SECONDS) return;
    if (previous?.active && previous.client_id !== clientId && elapsed <= MAX_GAP_SECONDS) return;
    const seconds = activityDelta(previous, now, clientId);
    if (seconds && previous) {
      // Divide a heartbeat crossing UTC midnight between the two calendar days.
      const start = now - seconds * 1000;
      const midnight = new Date(new Date(now).toISOString().slice(0, 10)).getTime();
      const segments = start < midnight ? [[start, (midnight - start) / 1000], [now, (now - midnight) / 1000]] : [[now, seconds]];
      for (const [at, duration] of segments) {
        await run(`INSERT INTO activity_daily(user_id,day,guide_id,active_seconds,listening_seconds) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(user_id,day,guide_id) DO UPDATE SET active_seconds=activity_daily.active_seconds+excluded.active_seconds,listening_seconds=activity_daily.listening_seconds+excluded.listening_seconds`,
        [userId, new Date(at).toISOString().slice(0, 10), previous.guide_id, duration, previous.listening && (!previous.listening_guide_id || previous.listening_guide_id === previous.guide_id) ? duration : 0]);
        if (previous.listening && previous.listening_guide_id && previous.listening_guide_id !== previous.guide_id) {
          await run(`INSERT INTO activity_daily(user_id,day,guide_id,active_seconds,listening_seconds) VALUES($1,$2,$3,0,$4)
            ON CONFLICT(user_id,day,guide_id) DO UPDATE SET listening_seconds=activity_daily.listening_seconds+excluded.listening_seconds`,
          [userId, new Date(at).toISOString().slice(0,10), previous.listening_guide_id, duration]);
        }
      }
    }
    await run(`INSERT INTO activity_state(user_id,client_id,guide_id,last_at,active,listening) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(user_id) DO UPDATE SET client_id=excluded.client_id,guide_id=excluded.guide_id,last_at=excluded.last_at,active=excluded.active,listening=excluded.listening`,
    [userId, clientId, guide.id, new Date(now), body.active, body.listening]);
    await run('UPDATE activity_state SET listening_guide_id=$2 WHERE user_id=$1', [userId, listeningGuide.id]);
    await run('UPDATE users SET selected_guide_id=$2,last_seen_at=now() WHERE id=$1', [userId, guide.id]);
  });
}

export async function accountAnalytics(days: number): Promise<unknown[]> {
  if (!databaseEnabled()) return [];
  return query(`SELECT u.id,u.email,u.last_seen_at,u.selected_guide_id,
    coalesce(a.guides,'[]'::jsonb) AS guides,coalesce(a.seconds,0) AS active_seconds,
    coalesce(e.costs,'[]'::jsonb) AS costs
    FROM users u
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('guideId',guide_id,'seconds',seconds,'listeningSeconds',listening) ORDER BY seconds DESC) AS guides,sum(seconds) AS seconds
      FROM (SELECT guide_id,sum(active_seconds) AS seconds,sum(listening_seconds) AS listening FROM activity_daily
        WHERE user_id=u.id AND day >= (now() AT TIME ZONE 'UTC')::date - ($1::int - 1) GROUP BY guide_id) g) a ON true
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('category',category,'model',model,'cost',cost,'tokens',tokens)) AS costs FROM (
      SELECT category,coalesce(metadata->>'model','') AS model,sum(estimated_cost_usd) AS cost,sum(input_tokens+output_tokens) AS tokens
      FROM usage_events WHERE user_id=u.id AND created_at>=now()-($1*interval '1 day')
      GROUP BY category,coalesce(metadata->>'model','')) c) e ON true ORDER BY u.last_seen_at DESC`, [days]);
}
