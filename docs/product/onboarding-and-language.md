# Guest Onboarding and Language Model

## Guest-first activation

Initial activation is:

Launch -> compact onboarding -> Explore as Guest -> location permission -> City Explorer.

Account creation is not part of first activation. Login remains available as an explicit secondary action from onboarding and Settings.

## Language model

Hey City has two independent language preferences.

Application language controls menus, navigation labels, buttons, onboarding copy, Settings, hints, empty states, system messages, validation messages, and user-facing errors.

Guide language controls future Dana and Arthur narration, TTS language, generated story language, and future guide conversation.

Changing application language updates UI copy immediately. Changing guide language does not change UI copy.

## Defaults and persistence

On first launch, the mobile app reads the device language, normalizes it to a supported application locale, and persists both:

- `appLanguage`
- `guideLanguage`

If the device language is unsupported, the app falls back to English.

After preferences exist locally, the app uses the persisted values and does not overwrite them when the system language changes.

Supported application languages in this slice:

- English
- Russian

## Guide preference

The preferred guide is one of:

- `dana`
- `arthur`

Dana is the default. There is no permanent dual-guide mode in this slice.

## Account prompt after value

The future optional account prompt copy is:

English:
I hope you enjoyed the walk. Create an account to save the places you visited, return to this story later, and share the walk with friends.

Russian:
Надеюсь, прогулка вам понравилась. Создайте аккаунт, чтобы сохранить посещённые места, вернуться к этой истории позже и поделиться прогулкой с друзьями.

This prompt is not shown during onboarding.

## Server sync follow-up

Guest preferences are local. Authenticated profile synchronization is not redesigned in this slice. A future server contract should define how local guest preferences merge into an authenticated account.
