import assert from 'node:assert/strict';
import { otpCodeEntry, authErrorTranslationKey, normalizeSubmittedCode } from '../src/features/auth/otpFlow';
import { translate } from '../src/localization/translations';

const email = otpCodeEntry('email');
assert.equal(email.keyboardType, 'number-pad');
assert.equal(email.maxLength, 6);
assert.equal(email.canVerify('123456'), true);
assert.equal(email.canVerify('abc123'), false);
assert.equal(email.canVerify('12345'), false);
assert.equal(email.canResend, true);

const admin = otpCodeEntry('admin_code');
assert.equal(admin.keyboardType, 'default');
assert.equal(admin.maxLength, 128);
assert.equal(admin.canVerify('long-Admin_Secret-2026'), true, 'admin code is not assumed numeric/six-digit');
assert.equal(admin.canVerify(''), false);
assert.equal(admin.canResend, false, 'admin access code is not reissued by email');
assert.equal(normalizeSubmittedCode('admin_code', ' AdminSecret '), ' AdminSecret ', 'admin code must be byte-for-byte unchanged');
assert.equal(normalizeSubmittedCode('email', ' 123456 '), '123456', 'email code is normalized');
assert.equal(authErrorTranslationKey('Invalid or expired OTP', 'admin_code'), 'auth.invalidAdminCode');
assert.equal(authErrorTranslationKey('Invalid or expired OTP', 'email'), 'auth.invalidOtp');
assert.equal(authErrorTranslationKey('Email is not enabled for the field test', null), 'auth.emailNotAllowed');
assert.match(translate('ru','auth.invalidAdminCode'), /сервере/);
assert.match(translate('en','auth.invalidOtp'), /email code/);
console.log('OTP flow presentation contract passed');
