import {
  createInitialGuestPreferences,
  normalizeGuidePreference,
  normalizeLocale,
  sanitizeGuestPreferences,
} from '../src/localization/preferences';
import { translate } from '../src/localization/translations';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(normalizeLocale('ru-RU'), 'ru', 'supported system locale becomes app language');
assertEqual(normalizeLocale('es-ES'), 'en', 'unsupported system locale falls back to English');

const firstRun = createInitialGuestPreferences('ru');
assertEqual(firstRun.appLanguage, 'ru', 'first-run app language uses system locale');
assertEqual(firstRun.guideLanguage, 'ru', 'first-run guide language equals app language');

const persisted = sanitizeGuestPreferences(
  {
    appLanguage: 'en',
    guideLanguage: 'ru',
    preferredGuideId: 'arthur',
    onboardingCompleted: true,
  },
  'ru'
);
assertEqual(persisted.appLanguage, 'en', 'persisted app language is not overwritten');
assertEqual(persisted.guideLanguage, 'ru', 'persisted guide language remains independent');
assertEqual(persisted.preferredGuideId, 'arthur', 'preferred guide persists');
assertEqual(persisted.onboardingCompleted, true, 'onboarding completion persists');
assertEqual(
  sanitizeGuestPreferences({ showOnboardingAtLaunch: false }, 'en').showOnboardingAtLaunch,
  false,
  'showOnboardingAtLaunch persists'
);

assertEqual(
  translate('ru', 'onboarding.title'),
  'Город полон историй',
  'changing app language updates translation output'
);
assertEqual(
  translate('en', 'onboarding.title'),
  'The city is full of stories',
  'English translation remains available'
);
assertEqual(
  translate(persisted.appLanguage, 'onboarding.title'),
  'The city is full of stories',
  'guide language does not change translation output'
);

assertEqual(
  sanitizeGuestPreferences({ appLanguage: 'zz', guideLanguage: 'xx' }, 'ru').appLanguage,
  'en',
  'invalid stored app locale falls back safely'
);
assertEqual(
  sanitizeGuestPreferences({ appLanguage: 'ru', guideLanguage: 'xx' }, 'ru').guideLanguage,
  'en',
  'invalid stored guide locale falls back safely'
);
assertEqual(normalizeGuidePreference('both'), 'dana', 'both guide mode is not accepted');

console.log('localizationPreferences tests passed');
