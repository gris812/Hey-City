import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';

async function run() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test/test';
  const pg = new PGlite();
  // Execute production migrations and SQL against PostgreSQL compiled to WASM.
  const execute = async (sql: string, values?: unknown[]) => {
    if (!values?.length && sql.includes('CREATE TABLE')) { await pg.exec(sql); return { rows: [] }; }
    return pg.query(sql, values);
  };
  Pool.prototype.query = execute as never;
  Pool.prototype.connect = (async () => ({ query: execute, release() {} })) as never;
  const { initializeDatabase, query } = await import('../src/services/database');
  const { initializeGuides, listGuides, getGuide, saveGuide, archiveGuide } = await import('../src/services/guides');
  await initializeDatabase(); await initializeGuides(); await initializeDatabase();
  assert.equal((await listGuides()).length, 2);
  const dana = (await getGuide('dana'))!;
  await saveGuide({ ...dana, id: 'third', ru: { ...dana.ru, name: 'Third' }, personality: 'Distinct style' });
  await initializeGuides();
  assert.equal((await getGuide('third'))!.personality, 'Distinct style');
  assert.equal((await listGuides()).length, 3);
  await assert.rejects(saveGuide({ ...dana, avatar: 'javascript:alert(1)' }), /Invalid/);
  await archiveGuide('third'); await archiveGuide('arthur');
  await assert.rejects(archiveGuide('dana'), /At least/);
  assert.equal((await listGuides(true)).length, 3, 'archive retains historical IDs');
  await saveGuide({ ...(await getGuide('arthur'))!, active: true });

  await query("INSERT INTO users(id,email) VALUES('u1','tester@example.com')");
  const { recordActivity, accountAnalytics, activityDelta } = await import('../src/services/activity');
  const realNow = Date.now;
  let now = realNow(); Date.now = () => now;
  const event = { clientId: 'client_one', guideId: 'dana', active: true, listening: true };
  try {
    await recordActivity('u1', event);
    now += 30000; await recordActivity('u1', event);
    now += 10000; await recordActivity('u1', { ...event, clientId: 'client_two' });
    now += 20000; await recordActivity('u1', { ...event, active: false });
    now += 120000; await recordActivity('u1', { ...event, guideId: 'arthur' });
    now += 30000; await recordActivity('u1', { ...event, guideId: 'arthur', listening: false });
    const rows = await query<{ guide_id: string; active_seconds: string; listening_seconds: string }>('SELECT * FROM activity_daily ORDER BY guide_id');
    assert.equal(Number(rows.find(r => r.guide_id === 'dana')!.active_seconds), 60, 'overlapping tabs do not double count');
    assert.equal(Number(rows.find(r => r.guide_id === 'arthur')!.active_seconds), 30, 'hidden/offline gap not counted');
    assert.equal(activityDelta(undefined, now, 'client_one'), 0);
  } finally { Date.now = realNow; }
  const { requestContext } = await import('../src/services/requestContext');
  const { recordUsage, adminSummary } = await import('../src/services/usage');
  await requestContext.run({ userId: 'u1' }, () => recordUsage({ category: 'google_maps', operation: 'reverse_geocoding', estimatedCostUsd: 0.005 }));
  await recordUsage({ userId: 'u1', category: 'ai', operation: 'story', inputTokens: 120, estimatedCostUsd: .02, metadata: { model: 'future-model' } });
  await recordUsage({ category: 'google_maps', operation: 'legacy', estimatedCostUsd: .01 });
  const stats = await accountAnalytics(30) as Array<{ selected_guide_id: string; active_seconds: string; guides: unknown[]; costs: Array<{ model: string; cost: number }> }>;
  assert.equal(stats[0].selected_guide_id, 'arthur');
  assert.equal(Number(stats[0].active_seconds), 90);
  assert(stats[0].costs.some(c => c.model === 'future-model'));
  assert.equal((await adminSummary()).unassignedCostUsd, .01);

  const { createApp } = await import('../src/app');
  const { jwt: jwtConfig } = await import('../src/config');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const request = async (path: string, email: string, role = 'admin', method = 'GET', body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { Authorization: `Bearer ${jwt.sign({userId:'u1',email,role},jwtConfig.secret)}`, 'Content-Type':'application/json' }, body: body ? JSON.stringify(body) : undefined });
  try {
    assert.equal((await request('/admin/guides','tester@example.com','user')).status,403);
    assert.equal((await request('/admin/guides','other@example.com')).status,403,'role alone cannot grant admin');
    const response = await request('/admin/guides','slepak@stolbergco.com'); assert.equal(response.status,200);
    const publicResponse = await fetch(`http://127.0.0.1:${port}/guides`); const catalog = await publicResponse.json() as { guides: Array<Record<string, unknown>> };
    assert.equal(catalog.guides.length,2); assert(!('personality' in catalog.guides[0]));
    assert.equal((await request('/admin/guides/dana','slepak@stolbergco.com','admin','PUT',{...dana,id:'different'})).status,400);
    assert.equal((await request('/admin/accounts','slepak@stolbergco.com')).status,200);
    console.log('admin catalog, SQL migrations, activity, attribution and access tests passed');
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); await pg.close(); }
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
