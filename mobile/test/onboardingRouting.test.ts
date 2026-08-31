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
  'Welcome',
  'guest without completed onboarding starts on Welcome'
);
assertEqual(
  initialRouteForSession(guest, true),
  'Welcome',
  'returning guest sees Welcome when onboarding-at-launch is enabled'
);
assertEqual(
  initialRouteForSession(guest, true, false, true),
  'Main',
  'showOnboardingAtLaunch false skips onboarding on returning launch'
);
assertEqual(
  initialRouteForSession(guest, true, true, true),
  'Welcome',
  'showOnboardingAtLaunch true opens Welcome'
);
assertEqual(
  initialRouteForSession(authenticated, false),
  'Welcome',
  'authenticated user without onboarding starts on Welcome'
);
assertEqual(
  initialRouteForSession(authenticated, true, false, true),
  'Main',
  'authenticated returning user may start on Explore'
);
assertEqual(
  initialRouteForSession(authenticated, true, true, true),
  'Welcome',
  'authenticated returning user follows onboarding-at-launch preference'
);
assertEqual(
  initialRouteForSession(guest, true, false, false),
  'Welcome',
  'existing installations see the new Welcome experience once'
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
