import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { Application } from 'express';

interface HandleableApp {
  handle: (req: never, res: never) => void;
}

async function run(): Promise<void> {
  process.env.AUTH_DISABLED = 'true';

  const { createApp } = await import('../src/app');
  const app = createApp();

  const start = await post<{ sessionId: string }>(app, '/sessions/start', {
      themeTags: ['government'],
      narrationStyle: 'documentary',
      lengthSec: 40,
      leadTimeMin: 2,
      voiceId: 'artur',
      language: 'en',
      autoplay: true,
    });
  assert.ok(start.sessionId.startsWith('drive_'));

  const first = await post<{
      nextAction: 'PLAY' | 'NONE';
      decision?: { type: string; poiId?: string };
      narrativePlan?: { poiId: string; mode: string; safety: { vehicleSafe: boolean } };
      estimatedDurationSec?: number;
      transcriptText?: string;
  }>(app, `/sessions/${start.sessionId}/context`, {
      lat: 40.7074,
      lng: -74.0104,
      heading: 180,
      speed: 35,
      timestamp: 10_000,
    });
  assert.equal(first.nextAction, 'PLAY');
  assert.equal(first.decision?.type, 'trigger_story');
  assert.equal(first.narrativePlan?.mode, 'vehicle');
  assert.equal(first.narrativePlan?.safety.vehicleSafe, true);
  assert.ok(first.estimatedDurationSec);
  assert.ok(first.estimatedDurationSec >= 30);
  assert.ok(first.estimatedDurationSec <= 45);
  assert.ok(first.transcriptText?.length);

  const second = await post<{
      nextAction: 'PLAY' | 'NONE';
      decision?: { type: string; reason?: string };
  }>(app, `/sessions/${start.sessionId}/context`, {
      lat: 40.7073,
      lng: -74.0105,
      heading: 90,
      speed: 35,
      timestamp: 20_000,
    });
  assert.equal(second.nextAction, 'NONE');
  assert.equal(second.decision?.type, 'hold');
  assert.equal(second.decision?.reason, 'already_listening');

  const storyEnd = await post<{
      ok: boolean;
      activeStoryWasPlaying: boolean;
      reason: string;
  }>(app, `/sessions/${start.sessionId}/story/end`, {
      reason: 'skipped',
    });
  assert.equal(storyEnd.ok, true);
  assert.equal(storyEnd.activeStoryWasPlaying, true);
  assert.equal(storyEnd.reason, 'skipped');

  const afterStoryEnd = await post<{
      nextAction: 'PLAY' | 'NONE';
      decision?: { type: string; reason?: string };
  }>(app, `/sessions/${start.sessionId}/context`, {
      lat: 40.7073,
      lng: -74.0105,
      heading: 90,
      speed: 35,
      timestamp: 30_000,
    });
  assert.equal(afterStoryEnd.nextAction, 'NONE');
  assert.equal(afterStoryEnd.decision?.type, 'hold');
  assert.equal(afterStoryEnd.decision?.reason, 'cooldown_active');

  const nearby = await get<{ candidates: Array<{ place_id: string; name: string }> }>(
    app,
    '/pois/nearby?lat=40.7074&lng=-74.0104&speed=35&theme=government'
  );
  assert.ok(nearby.candidates.length > 0);
  assert.ok(nearby.candidates.some((candidate) => candidate.place_id === 'poi_federal_hall'));

  const story = await post<{
      transcriptText: string;
      estimatedDurationSec: number;
      audioUrl: string;
  }>(app, '/stories/generate', {
      poiId: 'poi_federal_hall',
      lang: 'en',
      theme: 'government',
      style: 'documentary',
      lengthSec: 40,
      voiceId: 'artur',
      context: 'drive_discovery',
    });
  assert.ok(story.transcriptText.includes('poi_federal_hall'));
  assert.ok(story.estimatedDurationSec >= 30);
  assert.ok(story.estimatedDurationSec <= 45);
  assert.ok(story.audioUrl.startsWith('https://example.com/tts/'));

  console.log('httpAliases tests passed');
}

async function post<T>(app: Application, url: string, body: object): Promise<T> {
  return dispatch<T>(app, 'POST', url, body);
}

async function get<T>(app: Application, url: string): Promise<T> {
  return dispatch<T>(app, 'GET', url);
}

async function dispatch<T>(
  app: Application,
  method: 'GET' | 'POST',
  url: string,
  body?: object
): Promise<T> {
  const payload = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
  const req = new Readable({
    read() {
      this.push(payload);
      this.push(null);
    },
  }) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  req.headers = {
    'content-type': 'application/json',
    'content-length': String(payload.length),
  };

  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  }) as Writable & {
    statusCode: number;
    headers: Record<string, string | number | string[]>;
    setHeader: (name: string, value: string | number | string[]) => void;
    getHeader: (name: string) => string | number | string[] | undefined;
    end: (chunk?: unknown) => Writable;
  };
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
  };
  res.getHeader = (name) => res.headers[name.toLowerCase()];

  const responseDone = new Promise<void>((resolve) => {
    const originalEnd = res.end.bind(res);
    res.end = (chunk?: unknown) => {
      if (chunk !== undefined) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      originalEnd();
      resolve();
      return res;
    };
  });

  (app as unknown as HandleableApp).handle(req as never, res as never);
  await responseDone;

  const text = Buffer.concat(chunks).toString('utf8');
  const data = JSON.parse(text) as T | { error?: string };
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(
      typeof data === 'object' && data && 'error' in data
        ? data.error
        : `HTTP ${res.statusCode}`
    );
  }
  return data as T;
}

void run();
