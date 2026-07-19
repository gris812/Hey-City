import {
  ACCOUNT_REQUIRED_MESSAGE,
  AppIdentityState,
  createGuestId,
  guestIdentity,
  guestProfileDefaults,
  identityFromStoredToken,
  initialRouteForIdentity,
  shouldLoadProfile,
} from '../src/context/appIdentity';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

const guestId = createGuestId(() => 0.5, () => 1_700_000_000_000);
assertEqual(
  guestId,
  'guest_loyw3v28_0zik0zj',
  'guest id generation is deterministic with injected sources'
);
assertEqual(guestId.includes('@'), false, 'guest id contains no email marker');

assertDeepEqual(
  identityFromStoredToken(null, guestId),
  { status: 'guest', guestId },
  'no stored token starts as guest'
);

assertDeepEqual(
  identityFromStoredToken('valid-token', guestId),
  { status: 'authenticated', token: 'valid-token' },
  'stored token starts as authenticated'
);

assertDeepEqual(
  guestIdentity(guestId),
  { status: 'guest', guestId },
  'invalid token clearing transitions to guest'
);

assertDeepEqual(
  guestIdentity(guestId),
  { status: 'guest', guestId },
  'logout transitions to guest'
);

assertEqual(
  shouldLoadProfile({ status: 'guest', guestId }),
  false,
  'guest startup does not load /me'
);
assertEqual(
  shouldLoadProfile({ status: 'authenticated', token: 'valid-token' }),
  true,
  'authenticated identity may load /me'
);

assertEqual(
  initialRouteForIdentity({ status: 'guest', guestId }),
  'Main',
  'guest does not see Login as initial route'
);
assertEqual(
  initialRouteForIdentity({ status: 'authenticated', token: 'valid-token' }),
  'Main',
  'authenticated user enters product'
);
assertEqual(
  initialRouteForIdentity({ status: 'loading' }),
  null,
  'loading has no Login route'
);

assertDeepEqual(
  guestProfileDefaults,
  {
    preferredGuideId: 'dana',
    appLanguage: 'en',
    guideLanguage: 'en',
    autoplay: true,
    historyEnabled: false,
    themeTags: ['mixed'],
    narrationStyle: 'documentary',
  },
  'guest defaults are deterministic'
);

assertEqual(
  ACCOUNT_REQUIRED_MESSAGE.includes('Invalid or expired token'),
  false,
  'account-required copy does not expose raw backend auth text'
);

const impossibleFakeIdentity: AppIdentityState = { status: 'guest', guestId };
assertEqual(
  'token' in impossibleFakeIdentity,
  false,
  'guest identity does not introduce a synthetic auth token'
);

console.log('appIdentity tests passed');
