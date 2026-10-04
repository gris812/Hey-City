import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_DISABLED = 'false';

  const { createApp } = await import('../src/app');
  const listener = createApp().listen(0);

  try {
    const port = (listener.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}/stories/voice-sample`;

    const anonymous = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voiceId: 'not-a-guide', lang: 'en' }),
    });
    assert.equal(anonymous.status, 401, 'voice preview still requires app identity or guest identity');

    const guest = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hey-city-guest-id': 'guest_test_abcdefg',
      },
      body: JSON.stringify({ voiceId: 'not-a-guide', lang: 'en' }),
    });
    assert.equal(guest.status, 400, 'guest identity reaches the bounded voice-sample controller');
    assert.equal(
      (await guest.json() as { error?: string }).error,
      'Guide is unavailable',
      'invalid guide is rejected before any TTS provider call',
    );

    console.log('voiceSampleAccess tests passed');
  } finally {
    listener.close();
  }
}

void run();
