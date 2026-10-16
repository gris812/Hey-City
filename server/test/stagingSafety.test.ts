import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'staging';
  process.env.AUTH_DISABLED = 'true'; // Must not bypass public staging auth.
  process.env.TESTER_EMAIL_ALLOWLIST = 'allowed@example.com';
  process.env.RESEND_API_KEY = '';
  process.env.PUBLIC_API_URL = 'http://localhost:4000';

  const { assertProductionConfig } = await import('../src/config');
  assert.throws(
    () => assertProductionConfig(),
    /JWT_SECRET|RESEND_API_KEY|PUBLIC_API_URL/,
    'staging startup must enforce safe configuration rather than silently use development defaults',
  );

  const { createApp } = await import('../src/app');
  const listener = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => listener.once('listening', resolve));
  const origin = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    String(input).startsWith('https://api.resend.com/')
      ? new Response('test provider unavailable', { status: 503 })
      : originalFetch(input, init)) as typeof fetch;

  try {
    const admin = await fetch(`${origin}/admin/guides`);
    assert.equal(admin.status, 401, 'staging ignores AUTH_DISABLED=true');
    const guideCatalog = await fetch(`${origin}/guides`);
    assert.equal(guideCatalog.status, 200, 'public catalog remains available');

    const health = await (await fetch(`${origin}/health`)).json() as Record<string, unknown>;
    assert.equal(health.environment, 'staging');
    assert.equal(health.service, 'hey-city-api');
    assert.ok(Array.isArray(health.capabilities));
    assert(!('databaseUrl' in health) && !('secrets' in health));

    const allowed = await fetch(`${origin}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'allowed@example.com' }),
    });
    assert.equal(allowed.status, 502, 'provider error must not fall back to console or delivery success');
    const rejected = await fetch(`${origin}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'outside@example.com' }),
    });
    assert.equal(rejected.status, 403, 'staging tester allowlist enforced');

    const guest = await fetch(`${origin}/stories/voice-sample`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hey-city-guest-id': 'guest_test_abcdefg',
      },
      body: JSON.stringify({ voiceId: 'dana', lang: 'en' }),
    });
    assert.equal(guest.status, 503, 'guest passes identity but TTS is unavailable without provider key');
    console.log('staging auth, OTP, guest preview and health security regressions passed');
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>(resolve => listener.close(() => resolve()));
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
