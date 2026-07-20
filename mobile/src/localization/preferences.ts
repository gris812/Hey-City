import { normalizeGuideId, type CanonicalGuideId } from './guideIds';

export const supportedLocales = ['en', 'ru'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

const supportedLocaleSet = new Set<string>(supportedLocales);

export type GuidePreference = CanonicalGuideId;

export type LanguagePreferences = {
  appLanguage: SupportedLocale;
  guideLanguage: SupportedLocale;
};

export type GuestPreferences = LanguagePreferences & {
  preferredGuideId: GuidePreference;
  onboardingCompleted: boolean;
  showOnboardingAtLaunch: boolean;
};

export const defaultLanguagePreferences: LanguagePreferences = {
  appLanguage: 'en',
  guideLanguage: 'en',
};

export function normalizeLocale(locale: string | null | undefined): SupportedLocale {
  if (!locale) return 'en';
  const language = locale.toLowerCase().split(/[-_]/)[0];
  return supportedLocaleSet.has(language) ? (language as SupportedLocale) : 'en';
}

export function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocaleSet.has(value);
}

export function normalizeGuidePreference(value: string | null | undefined): GuidePreference {
  return normalizeGuideId(value);
}

export function createInitialGuestPreferences(systemLocale: SupportedLocale): GuestPreferences {
  return {
    appLanguage: systemLocale,
    guideLanguage: systemLocale,
    preferredGuideId: 'dana',
    onboardingCompleted: false,
    showOnboardingAtLaunch: true,
  };
}

export function sanitizeGuestPreferences(
  stored: Partial<Record<keyof GuestPreferences, string | boolean | null>>,
  systemLocale: SupportedLocale
): GuestPreferences {
  const initial = createInitialGuestPreferences(systemLocale);
  return {
    appLanguage:
      typeof stored.appLanguage === 'string'
        ? normalizeLocale(stored.appLanguage)
        : initial.appLanguage,
    guideLanguage:
      typeof stored.guideLanguage === 'string'
        ? normalizeLocale(stored.guideLanguage)
        : initial.guideLanguage,
    preferredGuideId:
      typeof stored.preferredGuideId === 'string'
        ? normalizeGuidePreference(stored.preferredGuideId)
        : initial.preferredGuideId,
    onboardingCompleted:
      typeof stored.onboardingCompleted === 'boolean'
        ? stored.onboardingCompleted
        : initial.onboardingCompleted,
    showOnboardingAtLaunch:
      typeof stored.showOnboardingAtLaunch === 'boolean'
        ? stored.showOnboardingAtLaunch
        : initial.showOnboardingAtLaunch,
  };
}
