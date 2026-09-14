import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';

async function run() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';
  process.env.CORS_ORIGINS = 'https://heycity.stolbergco.com';
  const { media, openai } = await import('../src/config');
  const { generateNarrationFromPlan } = await import('../src/services/narration');
  const { narrativeGenerator } = await import('../src/services/narrativeGenerator');
  const { createNarrativePlan } = await import('../src/services/narrativePlan');
  const { createApp } = await import('../src/app');
  const { ProgressiveAudio } = await import('../src/services/progressiveAudio');
  const bounded = new ProgressiveAudio(2);
  assert.throws(()=>bounded.append(Buffer.alloc(3)),/buffer limit/);
  const realFetch = globalThis.fetch;
  const realGenerate = narrativeGenerator.generate;
  const directory = media.directory, key = openai.apiKey;
  media.directory = await mkdtemp('/tmp/heycity-progressive-test-');
  openai.apiKey = 'test-only';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  let calls = 0;
  let finished = false;
  globalThis.fetch = async (url, options) => {
    if (!String(url).includes('api.openai.com')) return realFetch(url, options);
    calls++;
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      upstream = controller;
      controller.enqueue(new Uint8Array([73, 68, 51, 1, 2, 3]));
    } }));
  };
  narrativeGenerator.generate = async () => ({ text: 'An early verified story.', providerId: 'test', cached: false });
  const plan = createNarrativePlan({poiId:'test-stream',placeName:'Museum',mode:'vehicle',guideId:'dana',themeTags:['history'],targetDurationSec:60});
  const generate = () => generateNarrationFromPlan(plan, {language:'en',narrationStyle:'documentary'});
  try {
    const [one, two] = await Promise.all([generate(), generate()]);
    assert.equal(calls, 1, 'identical concurrent stories share a single TTS');
    assert.equal(one.audioUrl, two.audioUrl);
    assert.equal(finished, false, 'narration response arrives before the provider closes audio');
    assert(!(await readdir(media.directory)).some(f=>f.endsWith('.mp3')),'unfinished file is not published');
    const path = new URL(one.audioUrl).pathname;
    const response = await realFetch(base + path, {headers:{Origin:'https://heycity.stolbergco.com',Range:'bytes=0-'}});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://heycity.stolbergco.com');
    const reader = response.body!.getReader();
    assert.deepEqual(Array.from((await reader.read()).value!), [73,68,51,1,2,3], 'HTTP gets first bytes while upstream is still open');
    assert.equal(finished, false);
    const unknown = await realFetch(base+'/media/000000000000000000000000.mp3');
    assert.equal(unknown.status,404); assert.equal(calls,1,'anonymous unknown GET cannot create paid work');
    // A disconnected reader does not cancel the shared generation for another listener.
    const abort = new AbortController();
    const other = await realFetch(base+path,{signal:abort.signal});
    await other.body!.getReader().read(); abort.abort();
    upstream.enqueue(new Uint8Array([4,5,6])); upstream.close(); finished = true;
    const rest: number[] = [];
    for (;;) { const chunk = await reader.read(); if(chunk.done) break; rest.push(...chunk.value); }
    assert.deepEqual(rest,[4,5,6]);
    const cached = await realFetch(base+path,{headers:{Range:'bytes=0-2'}});
    assert.equal(cached.status,206,'completed file supports Safari byte range replay');
    assert.deepEqual(Array.from(new Uint8Array(await cached.arrayBuffer())),[73,68,51]);
    assert.equal((await generate()).audioUrl,one.audioUrl); assert.equal(calls,1,'disk replay is free');

    narrativeGenerator.generate = async () => ({text:'Failed stream.',providerId:'test',cached:false});
    const failed = await generate();
    upstream.error(new Error('provider disconnected'));
    // Let the failed provider task settle before a late subscriber arrives.
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal((await realFetch(base+new URL(failed.audioUrl).pathname)).status,502);
    assert.equal((await readdir(media.directory)).filter(f=>f.endsWith('.mp3')).length,1,'failure never publishes partial MP3');
    assert(!(await readdir(media.directory)).some(f=>f.endsWith('.tmp')));
    narrativeGenerator.generate = async () => ({text:'Empty stream.',providerId:'test',cached:false});
    globalThis.fetch = async (url, options) => String(url).includes('api.openai.com')
      ? new Response(new Uint8Array()) : realFetch(url,options);
    assert.equal((await generate()).audioUrl,'','empty upstream must not announce playable audio');
    console.log('progressive speech: first-byte delivery, single flight, disconnect, cache, ranges and failure passed');
  } finally {
    globalThis.fetch = realFetch; narrativeGenerator.generate = realGenerate;
    media.directory = directory; openai.apiKey = key;
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
}
const deadline = setTimeout(()=>{ console.error('progressive speech test timed out'); process.exit(1); },10000);
void run().then(()=>clearTimeout(deadline),error=>{clearTimeout(deadline);console.error(error);process.exitCode=1;});
