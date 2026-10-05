import assert from 'node:assert/strict';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_EMAIL = 'admin@example.com';
  process.env.ADMIN_AUTH_CODE = '654321';
  process.env.OTP_PEPPER = 'test-pepper-that-is-longer-than-thirty-two-characters';
  process.env.TESTER_EMAIL_ALLOWLIST = 'admin@example.com,tester@example.com';
  process.env.RESEND_API_KEY = 'test-resend-key';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('provider down', { status: 503 });

  try {
    const { sendOtpEmail } = await import('../src/services/emailOtp');
    assert.equal(await sendOtpEmail('admin@example.com'), 'admin_code');
    await assert.rejects(
      () => sendOtpEmail('tester@example.com'),
      /Resend rejected email \(503\)/,
      'email provider failure must not be reported as successful delivery',
    );
    console.log('otpDelivery tests passed');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
