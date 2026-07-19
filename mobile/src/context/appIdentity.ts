import type { GuidePreference, SupportedLocale } from '../localization/preferences';

export type AppIdentityState =
  | { status: 'loading' }
  | { status: 'guest'; guestId: string }
  | { status: 'authenticated'; token: string };

export type AppIdentityStatus = AppIdentityState['status'];

export const guestProfileDefaults = {
  preferredGuideId: 'dana' as GuidePreference,
  appLanguage: 'en' as SupportedLocale,
  guideLanguage: 'en' as SupportedLocale,
  autoplay: true,
  historyEnabled: false,
  themeTags: ['mixed'],
  narrationStyle: 'documentary',
};

export const postValueAccountPrompt = {
  ru: 'Надеюсь, прогулка вам понравилась. Создайте аккаунт, чтобы сохранить посещённые места, вернуться к этой истории позже и поделиться прогулкой с друзьями.',
  en: 'I hope you enjoyed the walk. Create an account to save the places you visited, return to this story later, and share the walk with friends.',
};

export const ACCOUNT_REQUIRED_MESSAGE = 'Sign in to use this account feature.';

export function createGuestId(random = Math.random, now = Date.now): string {
  const randomPart = Math.floor(random() * 0xffffffff)
    .toString(36)
    .padStart(7, '0');
  return `guest_${now().toString(36)}_${randomPart}`;
}

export function identityFromStoredToken(
  token: string | null,
  guestId: string
): AppIdentityState {
  return token ? { status: 'authenticated', token } : { status: 'guest', guestId };
}

export function guestIdentity(guestId: string): AppIdentityState {
  return { status: 'guest', guestId };
}

export function isAuthenticatedIdentity(
  identity: AppIdentityState
): identity is Extract<AppIdentityState, { status: 'authenticated' }> {
  return identity.status === 'authenticated';
}

export function shouldLoadProfile(identity: AppIdentityState): boolean {
  return isAuthenticatedIdentity(identity);
}

export function initialRouteForIdentity(identity: AppIdentityState): 'Main' | 'Login' | null {
  if (identity.status === 'loading') return null;
  return 'Main';
}

export function initialRouteForSession(
  identity: AppIdentityState,
  _onboardingCompleted: boolean,
  _showOnboardingAtLaunch = true
): 'Onboarding' | 'Main' | null {
  if (identity.status === 'loading') return null;
  return 'Main';
}
