import assert from 'node:assert/strict';
import { translate } from '../src/localization/translations';
const keys = [
  'settings.account',
  'settings.guideInterests',
  'settings.language',
  'settings.audioText',
  'settings.audioHint',
  'settings.autoplayStories',
  'settings.appLaunch',
  'settings.historyPrivacy',
  'settings.about',
  'guide.danaQuote',
  'guide.arthurQuote',
  'auth.invalidAdminCode',
  'auth.invalidOtp',
] as const;
for (const key of keys) {
  assert.ok(translate('ru', key).length > 3);
  assert.notEqual(translate('ru', key), translate('en', key), `RU translation missing: ${key}`);
}
console.log('Settings/profile/auth Russian strings passed');
