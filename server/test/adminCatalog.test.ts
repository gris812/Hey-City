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

    const { createSession } = await import('../src/services/driveSession');
    const { evaluateAheadDiscovery } = await import('../src/services/aheadDiscovery');
    const session = createSession('u1', {mode:'walking',themeTags:['mixed'],narrationStyle:'documentary',lengthSec:60,leadTimeMin:2,voiceId:'dana',language:'en',autoplay:true});
    await evaluateAheadDiscovery({sessionId:session.id,movement:{latitude:38.627,longitude:-90.1994,headingDegrees:0,speedMps:1,accuracyMeters:10,timestamp:new Date().toISOString()},provider:{name:'google',searchAhead:async()=>[{providerId:'manual-museum',provider:'google',name:'Test Museum',targetType:'museum',latitude:38.627,longitude:-90.1994,providerTypes:['museum']}]}});
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => String(url).includes('wikipedia.org') ? new Response(JSON.stringify({query:{pages:{'123':{pageid:123,title:'Test Museum',coordinates:[{lat:38.627,lon:-90.1994}],extract:'The museum documents the history of this city and its river trade. Its collection includes architectural drawings and objects illustrating the development of transport and local industries. The museum opened its transport gallery in 1980.'}}}})) : savedFetch(url,options);
    try {
      const selected = await request('/sessions/'+session.id+'/select','slepak@stolbergco.com','admin','POST',{poiId:'manual-museum'});
      assert.equal(selected.status,200,'known discovery object can be selected explicitly');
      assert.equal((await selected.json() as {name:string}).name,'Test Museum');
      assert.equal((await request('/sessions/'+session.id+'/select','slepak@stolbergco.com','admin','POST',{poiId:'invented-id'})).status,404,'arbitrary IDs cannot seed stories');
      const { selectStory } = await import('../src/services/selectedStory');
      const { narrativeGenerator } = await import('../src/services/narrativeGenerator');
      const { stopSession, finishActiveStory } = await import('../src/services/driveSession');
      const originalGenerate = narrativeGenerator.generate;
      const durations: number[] = [];
      narrativeGenerator.generate = async ({plan, language}) => {
        durations.push(plan.targetDurationSec);
        assert.equal(language,'ru');
        return {text:'Здесь сохранилась история города и речной торговли.',providerId:'test',cached:false};
      };
      try {
        const identification = await selectStory(session.id,'u1','manual-museum','identify','ru');
        assert.doesNotMatch(identification.transcriptText, /Рассказать/);
        assert.equal(durations.length,0,'identification needs neither LLM nor source enrichment');
        await selectStory(session.id,'u1','manual-museum','long','ru');
        await selectStory(session.id,'u1','manual-museum','short','ru');
        assert.deepEqual(durations,[120,30]);
        await finishActiveStory(session.id, 'ended', session.journeyState.getActiveMoment()?.momentId);
        await assert.rejects(selectStory(session.id,'u1','manual-museum','long','ru'), /Недостаточно проверенной/,
          'a three-claim object must not offer a detailed continuation after the short story consumes two claims');
        // Exercise cancellation with a direct long request; the short continuation is intentionally unavailable above.
        session.storyContinuation = undefined;
        let release!: () => void;
        let started!: () => void;
        const waiting = new Promise<void>(resolve => {started=resolve;});
        narrativeGenerator.generate = async () => {
          started(); await new Promise<void>(resolve => {release=resolve;});
          return {text:'Старый рассказ.',providerId:'test',cached:false};
        };
        const previous = selectStory(session.id,'u1','manual-museum','long','ru');
        const rejected = assert.rejects(previous, /abort/i);
        await waiting;
        await selectStory(session.id,'u1','manual-museum','identify','ru');
        release(); await rejected;
        assert.equal(session.alreadyListening,true,'old completion cannot unlock latest story');
        const next = selectStory(session.id,'u1','manual-museum','long','ru');
        const stopped = assert.rejects(next, /abort/i);
        stopSession(session.id); await stopped;
      } finally {narrativeGenerator.generate=originalGenerate;}

    } finally { globalThis.fetch = savedFetch; }
    const { generateVoiceSample } = await import('../src/services/narration');
    const { openai, media } = await import('../src/config');
    const { mkdtemp, readdir } = await import('node:fs/promises');
    const originalDirectory = media.directory, originalKey = openai.apiKey;
    media.directory = await mkdtemp('/tmp/heycity-voice-test-'); openai.apiKey = 'test-only';
    let speechCalls = 0;
    globalThis.fetch = async () => { speechCalls++; await new Promise(resolve => setTimeout(resolve,10)); return new Response(new Uint8Array([73,68,51,1,2,3])); };
    try {
      const text = 'A unique voice test ' + Date.now();
      const [one,two] = await Promise.all([generateVoiceSample(text,'dana','en','u1'),generateVoiceSample(text,'dana','en','u1')]);
      assert.equal(speechCalls,1,'concurrent identical speech generates once');
      assert.equal(one.audioUrl,two.audioUrl);
      const files=await readdir(media.directory);
      assert.equal(files.filter(f=>f.endsWith('.mp3')).length,1);
      assert(!files.some(f=>f.endsWith('.tmp')),'no incomplete audio is published');
    } finally { globalThis.fetch=savedFetch; media.directory=originalDirectory; openai.apiKey=originalKey; }
    console.log('admin catalog, SQL migrations, activity, attribution, access and speech deduplication tests passed');
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); await pg.close(); }
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
