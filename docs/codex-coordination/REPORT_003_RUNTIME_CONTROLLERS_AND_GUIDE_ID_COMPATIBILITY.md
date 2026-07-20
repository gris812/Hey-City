# REPORT 003 - RUNTIME CONTROLLERS AND GUIDE ID COMPATIBILITY

Status: READY FOR ARCHITECTURE REVIEW

Implementation checkpoint SHA: f769cf5f36fc94c6bff80bd20b57cd5042ec8d3b

## Task Scope

Implemented only the Task 003 runtime architecture checkpoint:

- extracted Drive Discovery runtime state and side effects from `LiveScreen.tsx`;
- extracted Guided Tour demo state, timers, and guide/language lock logic;
- extracted Explore narrative playback state;
- normalized mobile guide identifiers around canonical `arthur`;
- preserved legacy backend compatibility for `artur`;
- removed web dependencies that were added for the failed Task 002 web screenshot attempt.

Not implemented by design: Guide Quick Preview, At Target photo/fallback, Stories fixtures, new sharing behavior, new route logic, or backend provider integrations.

## Architecture Before

Current `LiveScreen.tsx` before Task 003 coding: 1646 lines.

Observed ownership in one screen file:

- Drive backend session state and side effects: session id, ping interval, motion heading refs, profile ref, session errors, start/stop/finish/pause/resume actions, and Drive presentation mapping inputs;
- Guided Tour deterministic demo state: `GuidedTourState`, event index, narrative countdown, auto-continue timers, guide/language lock, and derived route/target/narrative state;
- Explore narrative state: selected target, pause state, trigger/close/pause/resume actions;
- temporary UI state: overlays, guide profiles, route save modal, share preview, selected interests;
- guide preference hydration and API serialization were split across mobile preferences, LiveScreen state, and Drive API call construction.

The main issue was not rendering drift; it was that runtime behavior, timers, cleanup, product identity compatibility, and screen composition were all coupled in one file.

## Architecture After

Current `LiveScreen.tsx` after Task 003 coding: 1338 lines.

New runtime controllers:

- `mobile/src/features/live/useDriveDiscoverySession.ts`
- `mobile/src/features/live/useGuidedTourDemo.ts`
- `mobile/src/features/live/useExploreNarrative.ts`
- `mobile/src/features/live/runtimeControllerContracts.ts`

`LiveScreen.tsx` now primarily:

- reads identity, preferences, and localization;
- composes the three runtime controllers;
- derives the typed foreground phase;
- creates screen view models and routes callbacks into extracted views;
- owns only temporary overlays and UI-specific state that does not belong to a runtime controller.

Remaining large sections are mostly screen composition, style declarations, and Task 002 dev screenshot harness support. Those sections remain in `LiveScreen.tsx` because moving them now would be a presentation refactor beyond this checkpoint.

## Controller Ownership

Drive controller owns:

- `sessionId`, `sessionError`, profile loading, backend start/stop/ping lifecycle;
- ping timer cleanup;
- mute/playback state coupled to Drive Discovery;
- `lastMotion`, `lastResult`, `playingName`, and mapped Drive presentation state;
- `finishStory`, `pausePlayback`, and `resumePlayback`.

Guided Tour controller owns:

- `GuidedTourState`;
- location-event index;
- narrative countdown and timers;
- start, pause, resume, continue, stop, and reset actions;
- active guide/language lock after tour start;
- current target, route coordinates, narrative state, target markers, and snapshot state for the dev harness.

Explore narrative controller owns:

- selected Explore target;
- Explore pause/playback state;
- trigger, close, pause, resume, and reset actions;
- a pure view-model helper that intentionally does not expose guided route metadata.

`LiveScreen.tsx` still owns:

- mode selection;
- modal/overlay routing;
- guide profile UI state;
- save/share UI state;
- selected interests in Tour Preferences.

## Guide ID Compatibility

Canonical decision implemented:

| Boundary | Input | Output | Result |
|---|---|---|---|
| mobile persistence hydration | `arthur` | `arthur` | PASS |
| mobile persistence hydration | legacy `artur` | `arthur` | PASS |
| mobile persistence hydration | unknown value | `dana` | PASS |
| new mobile preference writes | Arthur guide | `arthur` | PASS |
| Drive API adapter | `guideId: "arthur"` | backend `voiceId: "artur"` | PASS |
| Drive API adapter | `guideId: "dana"` | backend `voiceId: "dana"` | PASS |
| backend presentation mapping | `narrativePlan.guideId: "artur"` | `arthur` | PASS |
| display copy | canonical `arthur` | `Arthur` | PASS |
| asset filenames | `Artur.*` | unchanged | PASS |
| historical backend fixtures | `artur` | unchanged | PASS |

New compatibility utility:

- `mobile/src/localization/guideIds.ts`

This keeps business identifiers explicit at mobile persistence and API boundaries without broad mechanical renames of historical data or asset paths.

## Web Dependency Decision

Selected Option B - native-only MVP.

Removed from `mobile/package.json`:

- `web` script;
- `react-dom`;
- `react-native-web`.

Rationale:

- those dependencies were added only during the unsuccessful Task 002 web screenshot attempt;
- `react-native-maps` blocks the current map screens on web;
- keeping a `web` script would imply a supported target that does not actually work.

Current supported app targets remain native iOS/Android through Expo.

## Changed Files

- `mobile/src/screens/LiveScreen.tsx`
- `mobile/src/features/live/useDriveDiscoverySession.ts`
- `mobile/src/features/live/useGuidedTourDemo.ts`
- `mobile/src/features/live/useExploreNarrative.ts`
- `mobile/src/features/live/runtimeControllerContracts.ts`
- `mobile/src/localization/guideIds.ts`
- `mobile/src/localization/preferences.ts`
- `mobile/src/api/drive.ts`
- `mobile/src/presentation/mapDriveSessionToPresentation.ts`
- `mobile/test/guideIdCompatibility.test.ts`
- `mobile/test/runtimeControllers.test.ts`
- `mobile/test/localizationPreferences.test.ts`
- `mobile/test/mapDriveSessionToPresentation.test.ts`
- `mobile/tsconfig.presentation-test.json`
- `mobile/package.json`
- `package-lock.json`
- `docs/codex-coordination/screenshots/task-003/*.png`

## Regression Table

| Requirement | Result |
|---|---|
| guest Explore preserved | PASS |
| Tour Preferences preserved | PASS |
| guide selection preserved | PASS |
| legacy `artur` hydrates as Arthur | PASS |
| valid `arthur` remains Arthur | PASS |
| unknown guide values fall back to Dana | PASS |
| Drive API sends backend-compatible `artur` for Arthur | PASS |
| active-session guide/language lock preserved | PASS |
| Guided Tour start/progression preserved | PASS |
| pause/resume preserved | PASS |
| transcript open/close return phase preserved | PASS |
| Continue and auto-continue controller behavior preserved | PASS |
| Tour Complete path preserved | PASS |
| Save/Share surfaces preserved | PASS |
| Drive interval cleanup covered | PASS |
| Explore controller does not leak route metadata | PASS |
| foreground selector tests remain green | PASS |

## Tests Run

- `cd mobile && npm run typecheck` - PASS
- `cd mobile && npm run test:presentation` - PASS
- `cd mobile && npx expo-doctor` - PASS, 18/18 checks passed
- `npm run test --workspace server` - PASS

Focused tests run directly:

- `node .presentation-test-dist/test/guideIdCompatibility.test.js` - PASS
- `node .presentation-test-dist/test/runtimeControllers.test.js` - PASS

Server suite included:

- `driveDecision.test.ts`
- `driveReplay.test.ts`
- `driveRouteReplay.test.ts`
- `driveSessionLocal.test.ts`
- `httpAliases.test.ts`

## Screenshots

Captured on iOS Simulator, 1170 x 2532:

- `docs/codex-coordination/screenshots/task-003/01-explore-home.png`
- `docs/codex-coordination/screenshots/task-003/02-tour-preferences-legacy-artur-arthur.png`
- `docs/codex-coordination/screenshots/task-003/03-guided-navigation.png`
- `docs/codex-coordination/screenshots/task-003/04-active-story.png`
- `docs/codex-coordination/screenshots/task-003/05-transcript-open.png`
- `docs/codex-coordination/screenshots/task-003/06-transcript-closed-restored.png`
- `docs/codex-coordination/screenshots/task-003/07-drive-idle-guest-surface.png`

Drive authenticated screenshot was not captured because this checkpoint avoids exposing secrets. The included Drive screenshot covers the idle guest surface that is testable without credentials.

## Known Deviations

- The dev screenshot harness still uses the existing `task002Phase` query parameter name for continuity with Task 002 tooling; Task 003 adds a `drive_idle` phase to that harness.
- Full Russian localization of all Tour Preferences labels remains outside this checkpoint.
- `Artur.*` asset filenames and historical backend fixture identifiers remain unchanged intentionally; explicit adapters now handle business identifier compatibility.

## Final Status

READY FOR ARCHITECTURE REVIEW
