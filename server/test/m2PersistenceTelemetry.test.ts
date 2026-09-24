import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test/test';
  const pg = new PGlite();
  const execute = async (sql: string, values?: unknown[]) => {
    if (!values?.length && sql.includes('CREATE TABLE')) {
      await pg.exec(sql);
      return { rows: [] };
    }
    return pg.query(sql, values);
  };
  Pool.prototype.query = execute as never;

  const { initializeDatabase, query } = await import('../src/services/database');
  const { recordJourneyHistory, wasPoiListenedRecently, getRecentJourneyHistory } = await import('../src/services/history');
  const { recordExperienceDecision } = await import('../src/services/usage');
  await initializeDatabase();
  await query("INSERT INTO users(id,email,history_enabled) VALUES('history_on','on@example.com',true),('history_off','off@example.com',false)");

  const item = {
    placeId: 'place-1',
    metadata: { momentId: 'moment-1', storyLevel: 'short', outcome: 'completed', topicKeys: ['architecture'], evidenceRefs: ['source-1'], guideId: 'dana', area: { areaType: 'district' } },
  };
  const saved = await recordJourneyHistory('history_on', item);
  assert.equal(saved?.type, 'poi_listened');
  assert.equal((await recordJourneyHistory('history_on', { ...item, metadata: { ...item.metadata, outcome: 'skipped' } })), undefined);
  assert.equal((await recordJourneyHistory('history_off', item)), undefined);
  assert.equal((await recordJourneyHistory('guest_city_1234567', item)), undefined);
  assert.equal((await query('SELECT id FROM history_items')).length, 1, 'only opted-in signed-in user receives history');
  assert.equal((await getRecentJourneyHistory('history_on'))[0].entityId, 'place-1');
  assert.deepEqual(await getRecentJourneyHistory('history_off'), []);
  assert.deepEqual(await getRecentJourneyHistory('guest_city_1234567'), []);
  assert.equal(await wasPoiListenedRecently('guest_city_1234567', 'place-1', 1), false);
  assert.equal(await wasPoiListenedRecently('history_on', 'place-1', 1), true);
  await query("UPDATE history_items SET created_at=now() - interval '2 hours' WHERE user_id='history_on'");
  assert.equal(await wasPoiListenedRecently('history_on', 'place-1', 1), false);

  await recordExperienceDecision({
    sessionId: 'session-1', at: new Date().toISOString(),
    context: { movementMode: 'walking', locationBucket: 'downtown', candidateDensity: 4 },
    candidates: Array.from({ length: 25 }, (_, index) => ({ id: `candidate-${index}`.padEnd(180, 'x'), score: index })),
    decision: { type: 'hold', holdReason: 'cooldown' },
    outcome: { completed: false, listenedSeconds: 999999 },
    rawGps: { latitude: 38.6, longitude: -90.2 },
    transcript: 'private narration text',
  } as never, 'guest_city_1234567');
  const [event] = await query<{ user_id: string | null; metadata: Record<string, unknown> }>("SELECT user_id,metadata FROM usage_events WHERE operation='experience_decision'");
  assert.equal(event.user_id, null, 'guest telemetry is aggregate-only');
  const metadata = event.metadata;
  assert.equal((metadata.candidates as unknown[]).length, 20, 'candidate telemetry is bounded');
  assert.equal(((metadata.candidates as Array<{ id: string }>)[0].id).length, 120, 'telemetry strings are bounded');
  assert.equal((metadata.outcome as { listenedSeconds: number }).listenedSeconds, 86400);
  assert(!('rawGps' in metadata) && !('transcript' in metadata), 'unsafe unknown fields are excluded');

  await pg.close();
}

run().then(() => console.log('m2 persistence/telemetry tests passed')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
