import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'staging';
  process.env.AUTH_DISABLED = 'true'; // Must not bypass public staging auth.
  process.env.TESTER_EMAIL_ALLOWLIST = 'allowed@example.com';
  process.env.ADMIN_EMAIL = 'admin@example.com';
  process.env.ADMIN_AUTH_CODE = 'test-admin-code';
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

  let deliveredCode: string | undefined;
  globalThis.fetch = async (input, init) => {
    if (String(input) !== 'https://api.resend.com/emails') return originalFetch(input, init);
    const message = JSON.parse(String(init?.body)) as { to: string[]; text: string };
    if (message.to[0] === 'allowed@example.com') return new Response('test provider unavailable', { status: 503 });
    assert.deepEqual(message.to, ['outside@example.com']);
    deliveredCode = message.text.match(/\b\d{6}\b/)?.[0];
    return new Response(null, { status: 200 });
  };

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
    const newUser = await fetch(`${origin}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'outside@example.com' }),
    });
    assert.equal(newUser.status, 200, 'staging sends OTP to a fresh email outside the legacy allowlist');
    assert.equal((await newUser.json() as { delivery: string }).delivery, 'email');
    assert.ok(deliveredCode);
    const registration = await fetch(`${origin}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'outside@example.com', code: deliveredCode }),
    });
    assert.equal(registration.status, 200);
    assert.equal((await registration.json() as { user: { role: string } }).user.role, 'user');
    const adminDelivery = await fetch(`${origin}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com' }),
    });
    assert.equal(adminDelivery.status, 200);
    assert.equal((await adminDelivery.json() as { delivery: string }).delivery, 'admin_code');

    const guest = await fetch(`${origin}/stories/voice-sample`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hey-city-guest-id': 'guest_test_abcdefg',
      },
      body: JSON.stringify({ voiceId: 'dana', lang: 'en' }),
    });
    assert.equal(guest.status, 503, 'guest passes identity but TTS is unavailable without provider key');
    await Promise.all([admin.text(), guideCatalog.text(), allowed.text(), guest.text()]);
    console.log('staging auth, OTP, guest preview and health security regressions passed');
  } finally {
    globalThis.fetch = originalFetch;
    listener.closeAllConnections();
    await new Promise<void>(resolve => listener.close(() => resolve()));
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
