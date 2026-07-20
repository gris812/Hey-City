# REPORT 004 - GUIDE AND TARGET EXPERIENCE

Status: READY FOR DESIGN AND ARCHITECTURE REVIEW

## A. Implementation Commit

- Implementation SHA: `2f4243682a0393ff78ac381677f2231e71a1b2c1`
- Branch: `main`
- Working tree at final report commit: clean after push verification

## B. Audit Summary

Files inspected:

- `mobile/src/presentation/liveForeground.ts`
- `mobile/src/demo/guidedTour/controller.ts`
- `mobile/src/features/live/useGuidedTourDemo.ts`
- `mobile/src/features/live/useDriveDiscoverySession.ts`
- `mobile/src/features/live/useExploreNarrative.ts`
- `mobile/src/components/explore/TourPreferencesSheet.tsx`
- `mobile/src/components/explore/GuidedNavigationView.tsx`
- `mobile/src/components/explore/ActiveStoryView.tsx`
- `mobile/src/screens/LiveScreen.tsx`
- `mobile/src/demo/tours/tourB.ts`
- `mobile/src/demo/tours/types.ts`
- `mobile/assets/Guides/*`
- `mobile/test/*`

Pre-change state flow:

- `guided_approaching` existed as a foreground phase but was visually merged into `GuidedNavigationView`.
- Guided Tour hook transitioned from `arrived` directly to `beginNarrative`, so the user could miss arrival.
- Tour Preferences guide cards selected the guide directly; portrait tap opened full profile.
- Full Guide Profile existed as a separate full-screen modal.
- `tourBTargets` had media metadata but no actual local POI image assets.
- LiveScreen owned temporary overlays, guide profile modal, save/share modals, and controller composition.

Exact changes required:

- add Guide Quick Preview as a separate bottom sheet;
- split `guided_approaching` from navigation UI;
- add typed `guided_at_target` phase and explicit controller transition;
- make target media optional with image and no-image behavior;
- add stronger deterministic runtime harness tests;
- add GitHub Actions validation.

## C. Architecture Changes

Foreground phases before:

- `explore_idle`
- `guided_preferences`
- `guided_navigating`
- `guided_approaching`
- `guided_story_active`
- `guided_story_paused`
- `guided_story_complete`
- `guided_tour_complete`
- `drive_idle`
- `drive_active`

Foreground phases after:

- same list plus `guided_at_target`.

Guided Tour controller transitions after:

```text
exploring
-> approaching
-> arrived
-> at_target
-> narrating
-> waiting_to_continue
-> moving_to_next_target
```

Autoplay behavior:

- autoplay enabled: `at_target` remains visible for deterministic `arrivalAutoplayDelayMs`, then narration starts;
- autoplay disabled: `at_target` waits for `Start Story`;
- dev screenshots pin At Target snapshots in a paused controller state so screenshots do not race autoplay.

Overlay ownership:

- `LiveOverlay` now supports `guide_quick_preview`;
- Quick Preview and Tour Preferences remain mutually exclusive overlay states;
- Full Profile remains a separate full-screen modal and returns to Tour Preferences.

Target-media contract:

- `TargetMedia` is optional;
- local image sources are supplied by `LiveScreen`, not by pure demo data modules;
- missing image or image error renders the fallback card;
- `trinity-church-demo.png` is an AI-generated local demo asset with metadata documented in `tourB.ts`.

Component tree additions:

- `GuideQuickPreviewSheet`
- `ApproachingTargetView`
- `AtTargetView`

## D. Files Changed

| File | Purpose | Change Summary | Risk |
|---|---|---|---|
| `.github/workflows/validation.yml` | CI | Adds push/PR validation for mobile/server/shared paths | Low |
| `mobile/assets/Places/trinity-church-demo.png` | Demo media | Local AI-generated POI image for At Target image state | Medium |
| `mobile/src/components/explore/GuideQuickPreviewSheet.tsx` | UI | Compact Dana/Arthur guide preview | Medium |
| `mobile/src/components/explore/ApproachingTargetView.tsx` | UI | Explicit walking approaching foreground | Medium |
| `mobile/src/components/explore/AtTargetView.tsx` | UI | At Target image/fallback foreground | Medium |
| `mobile/src/components/explore/TourPreferencesSheet.tsx` | UI | Guide cards open quick preview; selection is explicit | Medium |
| `mobile/src/demo/guidedTour/controller.ts` | State machine | Adds `at_target`, `prepareAtTarget`, autoplay delay | Medium |
| `mobile/src/demo/guidedTour/modes.ts` | Types | Adds `at_target` journey state | Low |
| `mobile/src/demo/tours/types.ts` | Types | Adds optional `TargetMedia` contract | Low |
| `mobile/src/demo/tours/targetMedia.ts` | Adapter | Resolves optional media with fallback behavior | Low |
| `mobile/src/demo/tours/tourB.ts` | Fixtures | Documents image source and intentional no-image fallbacks | Low |
| `mobile/src/features/live/useGuidedTourDemo.ts` | Runtime controller | Adds arrival delay, Start Story, mode reset, harness helpers | Medium |
| `mobile/src/features/live/driveDiscoveryHarness.ts` | Tests | Pure deterministic Drive harness | Low |
| `mobile/src/localization/translations.ts` | Localization | Adds EN/RU copy for guide preview, approaching, at-target | Low |
| `mobile/src/presentation/liveForeground.ts` | Presentation selector | Adds `guided_at_target` and quick preview overlay type | Medium |
| `mobile/src/screens/LiveScreen.tsx` | Composition | Composes new views and dev screenshot phases | Medium |
| `mobile/test/guidedTourDemo.test.ts` | Tests | Updates arrival/at-target flow coverage | Low |
| `mobile/test/liveForeground.test.ts` | Tests | Covers approaching and at-target phase selection | Low |
| `mobile/test/runtimeControllers.test.ts` | Tests | Adds Drive/Guided/Explore deterministic integration harness checks | Low |

## E. Functional Regression Table

| Flow | Result | Evidence |
|---|---|---|
| Explore | PASS | `01-dana-quick-preview.png`, existing Explore remains underlying surface |
| Tour Preferences | PASS | `11-preferences-guide-selected.png` |
| Dana Quick Preview | PASS | `01-dana-quick-preview.png` |
| Arthur Quick Preview | PASS | `02-arthur-quick-preview.png` |
| Full Guide Profile | PASS | `03-dana-full-profile.png`, `04-arthur-full-profile.png` |
| Guided Navigation | PASS | `05-guided-navigation.png` |
| Approaching Target | PASS | `06-approaching-target-walking.png` |
| At Target image | PASS | `07-at-target-with-image.png` |
| At Target fallback | PASS | `08-at-target-fallback.png` |
| Story start | PASS | `09-active-story-after-start.png`, `runtimeControllers.test.js` |
| Pause/resume | PASS | `runtimeControllers.test.js`, existing story controls remain |
| Transcript | PASS | `10-transcript-open.png`, `liveForeground.test.js` |
| Mode switch | PASS | `runtimeControllers.test.js`; guided controller resets on mode exit |
| Drive session | PASS | `14-drive-idle-guest-surface.png`, server suite, Drive harness |

## F. Tests

Commands run:

- `cd mobile && npm run typecheck` - PASS
- `cd mobile && npm run test:presentation` - PASS
- `cd mobile && npx expo-doctor` - PASS, 18/18 checks
- `npm run test --workspace server` - PASS

Focused commands:

- `cd mobile && node .presentation-test-dist/test/runtimeControllers.test.js` - PASS
- `cd mobile && node .presentation-test-dist/test/liveForeground.test.js` - PASS

CI:

- GitHub Actions workflow added: `.github/workflows/validation.yml`
- Remote workflow result: PASS - `Validation` run `29752580019`, job `mobile-and-server`, completed in 32s
- Excluded from CI: `expo-doctor`, because it is a local Expo metadata validation and can become flaky in hosted CI. It remains a required local check and passed.

## G. Screenshot Review

Captured on available iOS Simulator, iPhone 16e, 1170 x 2532:

| File | State Shown | Match / Deviation | Localization / Accessibility Notes |
|---|---|---|---|
| `docs/codex-coordination/screenshots/task-004/01-dana-quick-preview.png` | Dana Quick Preview | Matches required compact bottom sheet | Uses localized labels and explicit selected text |
| `docs/codex-coordination/screenshots/task-004/02-arthur-quick-preview.png` | Arthur Quick Preview | Matches required compact bottom sheet | Uses canonical `arthur` |
| `docs/codex-coordination/screenshots/task-004/03-dana-full-profile.png` | Dana Full Profile | Regression preserved | Back action returns to guide selection |
| `docs/codex-coordination/screenshots/task-004/04-arthur-full-profile.png` | Arthur Full Profile | Regression preserved | Back action returns to guide selection |
| `docs/codex-coordination/screenshots/task-004/05-guided-navigation.png` | Guided Navigation | Regression preserved | No story card shown |
| `docs/codex-coordination/screenshots/task-004/06-approaching-target-walking.png` | Approaching Target | New distinct state | Story not active |
| `docs/codex-coordination/screenshots/task-004/07-at-target-with-image.png` | At Target with local image | New distinct state | Start Story CTA visible |
| `docs/codex-coordination/screenshots/task-004/08-at-target-fallback.png` | At Target no-image fallback | New fallback state | No broken placeholder |
| `docs/codex-coordination/screenshots/task-004/09-active-story-after-start.png` | Active Story | Regression after Start Story | Transcript remains separate |
| `docs/codex-coordination/screenshots/task-004/10-transcript-open.png` | Transcript | Regression preserved | Full-screen modal |
| `docs/codex-coordination/screenshots/task-004/11-preferences-guide-selected.png` | Tour Preferences, preview closed, guide selected | Required state captured | Selection not color-only |
| `docs/codex-coordination/screenshots/task-004/12-russian-approaching.png` | Russian Approaching | Required RU state captured | New UI copy localized |
| `docs/codex-coordination/screenshots/task-004/13-smallest-available-iphone-viewport.png` | At Target fallback on smallest available simulator | Environment only had iPhone 16e | True SE/mini simulator unavailable |
| `docs/codex-coordination/screenshots/task-004/14-drive-idle-guest-surface.png` | Drive idle guest surface | Driving approaching not reachable without credentials/backend trigger | No secrets used |

## H. Known Deviations

Blockers:

- None.

Acceptable MVP deviations:

- Smallest supported iPhone screenshot was captured on the smallest available simulator in this environment, iPhone 16e. No SE/mini simulator was installed.
- Driving-safe approaching was not reachable without authenticated Drive session and backend trigger data. Captured Drive idle guest surface instead.
- The POI image is an AI-generated local demo image, not a real licensed venue photo. It is documented as a demo asset.
- Full app i18n is still incomplete in older surfaces; all new TASK 004 copy added in this checkpoint has EN/RU entries.

Post-MVP opportunities:

- Add real licensed POI media assets with attribution and cache/failure telemetry.
- Add a true native hook test renderer if the repo adopts a React Native test stack.
- Add more compact Dynamic Type-specific screenshots once smaller simulator profiles are installed.

## I. Final Status

READY FOR DESIGN AND ARCHITECTURE REVIEW
