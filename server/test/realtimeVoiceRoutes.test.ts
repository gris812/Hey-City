import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { createSession, stopSession } from '../src/services/driveSession';
import { DeterministicRealtimeConversationProvider } from '../src/voice/deterministicRealtimeProvider';
import { RealtimeProviderRouter, setRealtimeProviderRouterForTests } from '../src/voice/realtimeProviderRouter';

process.env.AUTH_DISABLED = 'true';

async function run(): Promise<void> {
  const owned = createSession('gris', { mode: 'vehicle', themeTags: ['history'], narrationStyle: 'conversational',
    lengthSec: 30, leadTimeMin: 2, voiceId: 'dana', language: 'en', autoplay: true });
  const foreign = createSession('another-user', { mode: 'vehicle', themeTags: ['history'], narrationStyle: 'conversational',
    lengthSec: 30, leadTimeMin: 2, voiceId: 'dana', language: 'en', autoplay: true });
  const deterministic = new DeterministicRealtimeConversationProvider();
  setRealtimeProviderRouterForTests(new RealtimeProviderRouter([deterministic], 'deterministic'));
  const listener = createApp().listen(0);
  try {
    const port = (listener.address() as AddressInfo).port;
    const post = async (path: string, body: object) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    };
    const put = async (path: string, body: object) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    };
    assert.equal((await post(`/sessions/${foreign.id}/realtime-voice/connect`, { transport: 'native' })).status, 404,
      'high-cost session bootstrap requires DriveSession ownership');
    const connected = await post(`/sessions/${owned.id}/realtime-voice/connect`, { transport: 'native' });
    assert.equal(connected.status, 200);
    assert.equal(connected.body.providerId, 'deterministic');
    assert(!JSON.stringify(connected.body).includes('secret'));
    const usage = await post(`/sessions/${owned.id}/realtime-voice/usage`, {
      providerId: 'deterministic', generation: connected.body.generation,
      inputAudioBytes: 3200, outputAudioBytes: 6400,
      transcript: 'must not be accepted into the telemetry contract',
    });
    assert.equal(usage.status, 200);
    assert.deepEqual(usage.body, { ok: true });
    assert.equal((await post(`/sessions/${owned.id}/realtime-voice/usage`, {
      providerId: 'deterministic', generation: -1, inputAudioBytes: 1,
    })).status, 400);
    const changedGuide = await put(`/sessions/${owned.id}/guide`, { guideId: 'arthur' });
    assert.equal(changedGuide.status, 200);
    assert.equal(owned.realtimeVoiceSession?.snapshot().state, 'closed', 'guide change closes realtime provider session');
    assert.equal((await post(`/sessions/${owned.id}/realtime-voice/connect`, { transport: 'native' })).status, 200);
    const changedLanguage = await put(`/sessions/${owned.id}/guide`, { guideId: 'arthur', language: 'ru' });
    assert.equal(changedLanguage.status, 200);
    assert.equal(owned.realtimeVoiceSession?.snapshot().state, 'closed', 'language change closes realtime provider session');
    const closed = await post(`/sessions/${owned.id}/realtime-voice/close`, {});
    assert.equal(closed.status, 200);
    assert.equal(closed.body.state, 'closed');
  } finally {
    stopSession(owned.id);
    stopSession(foreign.id);
    setRealtimeProviderRouterForTests(undefined);
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  }
  console.log('M4 realtime voice routes: ownership, ephemeral bootstrap, bounded usage and cleanup passed');
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
