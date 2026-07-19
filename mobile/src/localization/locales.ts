import { NativeModules, Platform } from 'react-native';
import { normalizeLocale, type SupportedLocale } from './preferences';

export function getSystemLocale(): SupportedLocale {
  const locale =
    Platform.OS === 'ios'
      ? NativeModules.SettingsManager?.settings?.AppleLocale ??
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
      : NativeModules.I18nManager?.localeIdentifier;

  if (typeof locale === 'string') return normalizeLocale(locale);

  try {
    return normalizeLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch (_) {
    return 'en';
  }
}

export * from './preferences';
