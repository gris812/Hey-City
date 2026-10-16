import assert from 'node:assert/strict';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'development';
  process.env.ADMIN_EMAIL = 'admin@example.com';
  process.env.ADMIN_AUTH_CODE = '654321';
  process.env.OTP_PEPPER = 'test-pepper-that-is-longer-than-thirty-two-characters';
  process.env.TESTER_EMAIL_ALLOWLIST = '';
  process.env.RESEND_API_KEY = '';

  const { sendOtpEmail } = await import('../src/services/emailOtp');
  const delivery = await sendOtpEmail('new-user@example.com');
  assert.equal(delivery, 'development_console', 'development without Resend must explicitly report console fallback');
  console.log('otpConsoleFallback tests passed');
}

void run();
