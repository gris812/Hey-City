import assert from 'node:assert/strict';
import { resolveVoiceSampleUrl } from '../src/features/guides/voiceSampleUrl';
import { shouldInvalidateStoredSession } from '../src/api/authErrors';

const apiBase = 'http://172.20.10.2:4000';

assert.equal(
  resolveVoiceSampleUrl('http://localhost:4000/media/sample.mp3', apiBase),
  'http://172.20.10.2:4000/media/sample.mp3',
  'physical-device preview rewrites backend localhost media URL to the active API origin',
);
assert.equal(
  resolveVoiceSampleUrl('/media/sample.mp3', apiBase),
  'http://172.20.10.2:4000/media/sample.mp3',
  'relative media URL resolves against the active API origin',
);
assert.equal(
  resolveVoiceSampleUrl('https://api.example.com/media/sample.mp3', apiBase),
  'https://api.example.com/media/sample.mp3',
  'non-loopback public media URL remains unchanged',
);
assert.throws(
  () => resolveVoiceSampleUrl('', apiBase),
  /did not return an audio URL/i,
);

assert.equal(
  shouldInvalidateStoredSession('/auth/otp/verify', 401, 'Invalid or expired OTP'),
  false,
  'invalid OTP must remain an OTP error, not become a stored-session expiry',
);
assert.equal(
  shouldInvalidateStoredSession('/sessions/abc/realtime-voice/connect', 401, 'Unauthorized'),
  true,
  'authenticated API 401 still invalidates the stored app session',
);

console.log('native corrective pass: voice preview URL and OTP semantics passed');
