import assert from 'node:assert/strict';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_EMAIL = 'slepak@stolbergco.com';
  process.env.ADMIN_AUTH_CODE = '481516';
  process.env.OTP_PEPPER = 'test-pepper-that-is-longer-than-thirty-two-characters';
  process.env.TESTER_EMAIL_ALLOWLIST = 'slepak@stolbergco.com,tester@example.com';

  const { isAdminEmail, isEmailAllowed, sendOtpEmail, verifyOtp } = await import('../src/services/emailOtp');
  assert.equal(isAdminEmail('slepak@stolbergco.com'), true);
  assert.equal(isEmailAllowed('tester@example.com'), true);
  assert.equal(isEmailAllowed('stranger@example.com'), false);
  await sendOtpEmail('slepak@stolbergco.com');
  assert.equal(await verifyOtp('slepak@stolbergco.com', '000000'), false);
  assert.equal(await verifyOtp('slepak@stolbergco.com', '481516'), true);
  console.log('authSecurity tests passed');
}

void run();
