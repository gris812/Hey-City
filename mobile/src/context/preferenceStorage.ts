import { createInitialGuestPreferences, sanitizeGuestPreferences, type GuestPreferences, type SupportedLocale } from '../localization/preferences';

export interface PreferenceStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

const APP_LANGUAGE_KEY = 'pref_app_language';
const GUIDE_LANGUAGE_KEY = 'pref_guide_language';
const PREFERRED_GUIDE_KEY = 'pref_guide_id';
const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';
const SHOW_ONBOARDING_AT_LAUNCH_KEY = 'show_onboarding_at_launch';
const WELCOME_EXPERIENCE_SEEN_KEY = 'welcome_experience_v1_seen';

const MEASUREMENT_UNITS_KEY = 'pref_measurement_units';

export async function readPreferences(store: PreferenceStorage, systemLocale: SupportedLocale): Promise<GuestPreferences> {
  const [appLanguage, guideLanguage, preferredGuideId, onboardingCompleted, showOnboardingAtLaunch, welcomeExperienceSeen, measurementUnits] =
    await Promise.all([
      store.getItemAsync(APP_LANGUAGE_KEY),
      store.getItemAsync(GUIDE_LANGUAGE_KEY),
      store.getItemAsync(PREFERRED_GUIDE_KEY),
      store.getItemAsync(ONBOARDING_COMPLETED_KEY),
      store.getItemAsync(SHOW_ONBOARDING_AT_LAUNCH_KEY),
      store.getItemAsync(WELCOME_EXPERIENCE_SEEN_KEY),
      store.getItemAsync(MEASUREMENT_UNITS_KEY),
    ]);

  const hasStoredPreferences =
    measurementUnits !== null ||
    appLanguage !== null ||
    guideLanguage !== null ||
    preferredGuideId !== null ||
    onboardingCompleted !== null ||
    showOnboardingAtLaunch !== null ||
    welcomeExperienceSeen !== null;

  if (!hasStoredPreferences) {
    const initial = createInitialGuestPreferences(systemLocale);
    await persistPreferences(store, initial);
    return initial;
  }

  return sanitizeGuestPreferences(
    {
      measurementUnits,
      appLanguage,
      guideLanguage,
      preferredGuideId,
      onboardingCompleted: onboardingCompleted === 'true',
      showOnboardingAtLaunch:
        showOnboardingAtLaunch === null ? null : showOnboardingAtLaunch === 'true',
      welcomeExperienceSeen:
        welcomeExperienceSeen === null ? null : welcomeExperienceSeen === 'true',
    },
    systemLocale
  );
}

export async function persistPreferences(store: PreferenceStorage, preferences: GuestPreferences): Promise<void> {
  await Promise.all([
    store.setItemAsync(MEASUREMENT_UNITS_KEY, preferences.measurementUnits),
    store.setItemAsync(APP_LANGUAGE_KEY, preferences.appLanguage),
    store.setItemAsync(GUIDE_LANGUAGE_KEY, preferences.guideLanguage),
    store.setItemAsync(PREFERRED_GUIDE_KEY, preferences.preferredGuideId),
    store.setItemAsync(
      ONBOARDING_COMPLETED_KEY,
      preferences.onboardingCompleted ? 'true' : 'false'
    ),
    store.setItemAsync(
      SHOW_ONBOARDING_AT_LAUNCH_KEY,
      preferences.showOnboardingAtLaunch ? 'true' : 'false'
    ),
    store.setItemAsync(
      WELCOME_EXPERIENCE_SEEN_KEY,
      preferences.welcomeExperienceSeen ? 'true' : 'false'
    ),
  ]);
}
