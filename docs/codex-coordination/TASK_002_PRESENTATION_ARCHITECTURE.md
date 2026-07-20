# Codex Task 002 — Presentation Architecture Correction

## Objective

Correct the current mobile presentation architecture before adding new UI surfaces.

Scope is limited to:

1. extracting screen-specific presentation components from `LiveScreen.tsx`;
2. introducing one typed presentation-phase selector;
3. separating Explore from Guided Tour metadata;
4. making Guided Navigation, Active Story and Transcript mutually exclusive foreground states;
5. preserving current working behavior.

Do not implement Guide Quick Preview, At Target photo/fallback, Stories fixtures, new sharing features, backend redesign or Drive redesign in this task.

## Read first

- `docs/codex-coordination/AUDIT_002_CITY_SIGNAL_MAIN.md`
- `docs/codex-coordination/USER_FLOW_STATUS_V1.md`
- current `mobile/src/screens/LiveScreen.tsx`
- Guided Tour demo state implementation
- current presentation tests

Before coding, document in the report:

- current `LiveScreen.tsx` line count;
- state variables grouped by responsibility;
- backend-authoritative state;
- local demo-authoritative state;
- temporary UI state;
- exact files to create or modify.

## Required architecture

### Keep `LiveScreen` as composition root

It may own coordination, callbacks, phase selection and overlay coordination. It must not own detailed JSX/styles for every product state.

### Extract at minimum

- `ExploreHomeView`
- `GuidedNavigationView`
- `ActiveStoryView`
- `TranscriptSheet`
- `TourPreferencesSheet`

Use narrow typed props. Do not pass the entire `LiveScreen` state object.

### Typed foreground selector

Create a pure selector returning exactly one phase, conceptually:

```ts
type LiveForegroundPhase =
  | 'explore_idle'
  | 'guided_preferences'
  | 'guided_navigating'
  | 'guided_approaching'
  | 'guided_story_active'
  | 'guided_story_paused'
  | 'guided_story_complete'
  | 'guided_tour_complete'
  | 'drive_idle'
  | 'drive_active';
```

Do not duplicate discovery or tour business logic.

### Typed overlay state

Replace overlap-prone booleans for modified surfaces with one overlay model where practical. Transcript must store/restore the prior phase. Do not broaden this into a full modal rewrite.

## UX corrections

### Explore Home

Remove from primary Explore content:

- `Downtown Manhattan Walk`;
- `4 stops - 2.3 km - 52 min`;
- `Preview Route` as the primary secondary action.

Show current area, selected guide, ambient-discovery copy and one primary ambient state/CTA. A secondary `Choose a guided walk` action may open existing Tour Preferences. Do not fabricate a production DiscoveryTarget for guests.

### Guided Navigation

Keep one control system only:

- Pause/Resume;
- Transcript;
- End Tour with confirmation.

Remove duplicate compact-plus-full controls.

### Active Story

During narrating/paused states, render Active Story as the primary foreground surface. Do not simultaneously render the full navigation card. Retain map context, guide, POI title, short story text and controls. Preserve deterministic timing and pause behavior. Do not add photography yet.

### Story Complete

During waiting-to-continue, render one decision surface and preserve Continue and auto-continue behavior.

### Transcript

Transcript must be the sole foreground readable sheet, scroll on small devices, disable underlying interaction and restore the exact prior phase on close.

## `artur` / `arthur` audit

Do not change identifiers in this task. Inventory all current occurrences and persistence/API boundaries for both spellings. Report whether old stored preferences or payloads can break. Document any compatibility defect as a blocker/follow-up; do not silently migrate.

## Tests

Add behavioral tests for:

1. one phase returned;
2. Explore view model has no fixed route metadata;
3. Guided Navigation has one control set;
4. narrating selects Active Story;
5. waiting selects Story Complete;
6. transcript restores prior phase;
7. Tour Preferences still starts the demo;
8. guide and language remain locked during active tour;
9. mode switching preserves reset behavior;
10. Drive API contracts remain unchanged.

Keep the source-text contract test, but do not treat it as proof of completion.

Run:

```bash
cd mobile
npm run typecheck
npm run test:presentation
npx expo-doctor
```

Run relevant server session tests.

## Screenshots

Commit fresh simulator screenshots under:

```text
docs/codex-coordination/screenshots/task-002/
```

Required:

1. Explore Home;
2. Tour Preferences;
3. Guided Navigation;
4. Active Story;
5. Story paused;
6. Story Complete;
7. Transcript open;
8. Transcript closed/restored;
9. Russian dense screen;
10. smallest supported iPhone viewport.

## Report

Create:

```text
docs/codex-coordination/REPORT_002_PRESENTATION_ARCHITECTURE.md
```

Include commit SHA, architecture before/after, state ownership, changed files, regression table, tests, screenshot paths, naming compatibility audit, known deviations and final status.

Final status:

- `READY FOR ARCHITECTURE REVIEW`
- `NOT READY — BLOCKERS REMAIN`

## Definition of done

- `LiveScreen` is orchestration-focused;
- extracted components have narrow typed props;
- only one foreground phase is active;
- Explore has no fixed Guided Tour metadata;
- Guided Navigation has one control system;
- Active Story does not compete with navigation;
- Transcript is exclusive and restores state;
- existing behavior is preserved;
- tests pass;
- screenshots/report are committed;
- working tree is clean.
