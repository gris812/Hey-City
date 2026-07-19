import {
  AUTH_SESSION_EXPIRED_MESSAGE,
  isAuthenticationFailure,
  toUserSafeRequestMessage,
} from '../src/api/authErrors';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(
  isAuthenticationFailure(401, 'Invalid or expired token'),
  true,
  '401 invalid token is an authentication failure'
);
assertEqual(
  isAuthenticationFailure(401, 'Unauthorized'),
  true,
  '401 unauthorized is an authentication failure'
);
assertEqual(
  toUserSafeRequestMessage(401, 'Invalid or expired token'),
  AUTH_SESSION_EXPIRED_MESSAGE,
  'raw backend auth message is sanitized'
);
assertEqual(
  isAuthenticationFailure(500, 'Unauthorized upstream service'),
  false,
  'non-auth server errors are not expired sessions'
);
assertEqual(
  toUserSafeRequestMessage(500, 'Server unavailable'),
  'Server unavailable',
  'non-auth errors remain diagnosable'
);

console.log('authErrors tests passed');
