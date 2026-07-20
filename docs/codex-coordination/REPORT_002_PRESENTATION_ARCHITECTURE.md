# REPORT 002 - PRESENTATION ARCHITECTURE

Status: READY FOR ARCHITECTURE REVIEW

Commit SHA: ad1c7afa42ae1f394ee5a4fad2351f195130a251

## Task Scope

Implemented only the Task 002 presentation-architecture checkpoint:

- extracted screen-specific foreground presentation components from `LiveScreen.tsx`;
- introduced one typed `LiveForegroundPhase` selector;
- separated Explore Home from Guided Tour route metadata;
- made Guided Navigation, Active Story, Story Complete, and Transcript mutually exclusive foreground states;
- preserved Drive API/session behavior and guided tour demo behavior.

Not implemented by design: Guide Quick Preview, At Target photo/fallback, Stories fixtures, new sharing, backend redesign, Drive redesign.

## Architecture Before

Current `LiveScreen.tsx` before coding: 1719 lines.

Observed responsibilities in one file:

- backend-authoritative Drive state: `driveDiscoveryOn`, `sessionId`, `sessionError`, `muted`, `lastResult`, `playingName`, `localPlaybackState`, `lastMotion`, `pingIntervalRef`, `profileRef`, `lastHeadingRef`, `startSession`, `stopSession`, `finishStory`, `pausePlayback`, `resumePlayback`;
- local demo-authoritative guided state: `tourState`, `tourEventIndex`, `narrativeRemainingMs`, `activeGuideId`, `activeGuideLanguage`, `currentTarget`, `narrativeTarget`, `activeNarrative`, `currentTargetTitle`, `approachText`, `completedRouteCoordinates`, `upcomingRouteCoordinates`, `startTour`, `stopTour`, `continueTour`, `pauseTour`, `resumeTour`, `confirmStopTour`;
- temporary UI state: `routeSaveModal`, `tourPreferencesOpen`, `guideProfileOpen`, `selectedInterests`, `transcriptOpen`, `sharePreviewOpen`, `sharePreviewState`, `exploreNarrativeTargetId`, `exploreNarrativePaused`;
- product/mode state: `mode`, `visibleExplorationModes`, `settingsOpen`, `themes`, `style`, `lengthSec`, `leadTimeMin`, `autoplay`.

Main problem: foreground rendering was selected by overlapping booleans and journey-state checks rather than one explicit presentation phase.

## Architecture After

Current `LiveScreen.tsx` after coding: 1646 lines.

New selector:

- `mobile/src/presentation/liveForeground.ts`
- phase union:
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

New extracted components:

- `mobile/src/components/explore/ExploreHomeView.tsx`
- `mobile/src/components/explore/GuidedNavigationView.tsx`
- `mobile/src/components/explore/ActiveStoryView.tsx`
- `mobile/src/components/explore/TranscriptSheet.tsx`
- `mobile/src/components/explore/TourPreferencesSheet.tsx`

Overlay state now uses `LiveOverlay` instead of separate `tourPreferencesOpen` and `transcriptOpen` booleans. Transcript stores `returnPhase` and closes back to the prior foreground state.

Dev-only screenshot support:

- `LiveScreen.tsx` has a `__DEV__` Task 002 deep-link harness for simulator screenshots.
- It does not add a user-facing surface and does not run outside development builds.

## State Ownership

Backend-authoritative state remains unchanged:

- Drive session start/stop/ping/finish still calls `mobile/src/api/drive.ts`;
- server session tests pass without Drive contract edits;
- `mapDriveSessionToPresentation` remains the Drive presentation mapper.

Local demo-authoritative state remains in the guided tour controller:

- `mobile/src/demo/guidedTour/controller.ts` still owns start, pause, resume, continue, auto-continue and target progression;
- `LiveScreen` now maps this state into foreground phases.

Temporary UI state changed:

- removed overlap-prone `tourPreferencesOpen`;
- removed overlap-prone `transcriptOpen`;
- added `LiveOverlay` with `tour_preferences` and `transcript`.

## UX Corrections

Explore Home:

- removed fixed guided-tour metadata from Explore Home foreground: no `Downtown Manhattan Walk`, no `4 stops - 2.3 km - 52 min`, no `Preview Route` primary secondary action;
- shows current area, selected guide, ambient-discovery copy and `Listening nearby`;
- secondary action is `Choose a guided walk`, which opens Tour Preferences.

Guided Navigation:

- extracted into `GuidedNavigationView`;
- one control set only: Pause/Resume, Transcript, End Tour;
- no duplicate compact controls.

Active Story:

- extracted into `ActiveStoryView`;
- story states render as primary foreground surface over retained map context;
- full navigation card is not rendered at the same time.

Story Complete:

- waiting-to-continue selects `guided_story_complete`;
- one story decision surface is shown with Continue and auto-continue countdown.

Transcript:

- extracted into `TranscriptSheet`;
- full-screen modal blocks underlying interaction;
- scrollable content area on small screens;
- close restores prior foreground phase.

## Changed Files

- `mobile/src/screens/LiveScreen.tsx`
- `mobile/src/presentation/liveForeground.ts`
- `mobile/src/presentation/index.ts`
- `mobile/src/components/explore/ExploreHomeView.tsx`
- `mobile/src/components/explore/GuidedNavigationView.tsx`
- `mobile/src/components/explore/ActiveStoryView.tsx`
- `mobile/src/components/explore/TranscriptSheet.tsx`
- `mobile/src/components/explore/TourPreferencesSheet.tsx`
- `mobile/test/liveForeground.test.ts`
- `mobile/test/citySignalUiContract.test.cjs`
- `mobile/package.json`
- `package-lock.json`
- `docs/codex-coordination/screenshots/task-002/*.png`

Dependency note:

- Updated `expo` from `~54.0.35` to `~54.0.36` to satisfy `expo-doctor`.
- Added Expo-compatible `react-dom` and `react-native-web` after `expo start --web` reported missing web dependencies. Web still cannot run this app because `react-native-maps` imports native-only modules; screenshots were captured on iOS Simulator instead.

## Regression Table

| Requirement | Result |
|---|---|
| one phase returned | PASS - `selectLiveForegroundPhase` returns a single `LiveForegroundPhase` |
| Explore view model has no fixed route metadata | PASS |
| Guided Navigation has one control set | PASS |
| narrating selects Active Story | PASS |
| waiting selects Story Complete | PASS |
| transcript restores prior phase | PASS |
| Tour Preferences still starts demo | PASS |
| guide/language remain locked during active tour | PASS |
| mode switching preserves reset behavior | PASS |
| Drive API contracts unchanged | PASS |

## Tests Run

- `cd mobile && npm run typecheck` - PASS
- `cd mobile && npm run test:presentation` - PASS
- `cd mobile && npx expo-doctor` - PASS
- `npm run test --workspace server` - PASS

Server suite included:

- `driveDecision.test.ts`
- `driveReplay.test.ts`
- `driveRouteReplay.test.ts`
- `driveSessionLocal.test.ts`
- `httpAliases.test.ts`

## Screenshots

Captured on iOS Simulator, iPhone 16e, 1170 x 2532:

- `docs/codex-coordination/screenshots/task-002/01-explore-home.png`
- `docs/codex-coordination/screenshots/task-002/02-tour-preferences.png`
- `docs/codex-coordination/screenshots/task-002/03-guided-navigation.png`
- `docs/codex-coordination/screenshots/task-002/04-active-story.png`
- `docs/codex-coordination/screenshots/task-002/05-story-paused.png`
- `docs/codex-coordination/screenshots/task-002/06-story-complete.png`
- `docs/codex-coordination/screenshots/task-002/07-transcript-open.png`
- `docs/codex-coordination/screenshots/task-002/08-transcript-closed-restored.png`
- `docs/codex-coordination/screenshots/task-002/09-russian-dense-screen.png`
- `docs/codex-coordination/screenshots/task-002/10-smallest-iphone-viewport.png`

## Naming Compatibility Audit

Current inventory:

- `arthur` is used as the canonical mobile code identifier:
  - `mobile/src/localization/preferences.ts`
  - `mobile/src/presentation/livePresentation.ts`
  - `mobile/src/location/types.ts`
  - `mobile/src/api/me.ts`
  - `mobile/src/demo/tours/tourB.ts`
  - `mobile/src/screens/*`
  - mobile tests
- `Arthur` is used as display text in mobile translations and docs.
- `Artur` remains in asset filenames and legacy guide data:
  - `mobile/assets/Guides/Artur.png`
  - `mobile/assets/Guides/ArturSelection.png`
  - `data/guides/Artur.json`
- `artur` remains in backend/demo fixtures:
  - `data/guides/Artur.json`
  - `data/routes/federal-hall-drive-replay.json`
  - `server/test/driveSessionLocal.test.ts`
  - `server/test/driveReplay.test.ts`
  - `server/test/httpAliases.test.ts`

Compatibility conclusion:

- Existing stored mobile preferences with `preferredGuideId: "artur"` do not crash, but `sanitizeGuestPreferences` currently falls back to `dana`; this can silently lose a legacy Arthur preference.
- Backend Drive fixtures and session params still use `voiceId: "artur"` while mobile guided preferences use `arthur`.
- No silent migration was implemented in this task, per instruction.

Follow-up blocker:

- Add an explicit compatibility decision: either support `artur` as a legacy alias at persistence/API boundaries or run a documented migration. Until that is decided, this remains a contract compatibility defect.

## Known Deviations

- Full Russian localization of Tour Preferences labels remains incomplete; Russian dense screenshot validates layout/adaptation, not complete i18n.
- Expo web cannot render the app because `react-native-maps` is native-only in this setup. iOS Simulator screenshots are the authoritative visual evidence for this checkpoint.
- `LiveScreen.tsx` is still large because Drive session UI and route completion/share surfaces remain in place. Task 002 reduced foreground overlap but did not redesign the full composition root.

## Final Status

READY FOR ARCHITECTURE REVIEW
