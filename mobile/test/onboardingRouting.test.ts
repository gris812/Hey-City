import {
  createInitialGuestPreferences,
  sanitizeGuestPreferences,
} from '../src/localization/preferences';
import {
  guestIdentity,
  initialRouteForSession,
  identityFromStoredToken,
} from '../src/context/appIdentity';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const guest = guestIdentity('guest_local');
const authenticated = identityFromStoredToken('valid-token', 'guest_local');

assertEqual(
  initialRouteForSession(guest, false),
  'Main',
  'guest without completed onboarding starts on Explore'
);
assertEqual(
  initialRouteForSession(guest, true),
  'Main',
  'completed onboarding starts on Explore'
);
assertEqual(
  initialRouteForSession(guest, true, false),
  'Main',
  'showOnboardingAtLaunch false skips onboarding on returning launch'
);
assertEqual(
  initialRouteForSession(guest, true, true),
  'Main',
  'showOnboardingAtLaunch true does not block Explore'
);
assertEqual(
  initialRouteForSession(authenticated, false),
  'Main',
  'authenticated user without onboarding starts on Explore'
);
assertEqual(
  initialRouteForSession(authenticated, true),
  'Main',
  'authenticated user starts on Explore'
);
assertEqual(
  initialRouteForSession(authenticated, true, false),
  'Main',
  'authenticated user may skip onboarding on returning launch'
);
assertEqual(
  initialRouteForSession({ status: 'loading' }, false),
  null,
  'identity loading renders neutral temporary state'
);

const preferences = createInitialGuestPreferences('en');
const completed = sanitizeGuestPreferences(
  { ...preferences, onboardingCompleted: true },
  'en'
);
assertEqual(completed.onboardingCompleted, true, 'Explore as Guest completes onboarding without account creation');

console.log('onboardingRouting tests passed');
