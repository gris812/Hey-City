# TASK 003 — Runtime Controllers and Guide ID Compatibility

## Objective

Complete the mobile architecture correction without changing the accepted City Signal UI or backend product behavior.

This checkpoint is limited to:

1. extracting runtime controllers from `LiveScreen.tsx`;
2. resolving `artur` / `arthur` compatibility at explicit boundaries;
3. reviewing the newly added web dependencies;
4. preserving all current screens and flows.

Do not add Guide Quick Preview, At Target photo/fallback, Stories fixtures, new sharing behavior, new route logic, or backend provider integrations in this checkpoint.

---

## 1. Mandatory audit before coding

Report the current ownership of:

- Drive backend session state and side effects;
- Guided Tour deterministic demo state and timers;
- Explore narrative state;
- modal/overlay state;
- completion/save/share state;
- guide preference persistence and API serialization.

Identify every boundary where `artur`, `arthur`, or `Arthur` is accepted, stored, serialized, displayed, or used as an asset name.

---

## 2. Canonical guide identifier decision

Use the following decision:

```text
Canonical internal identifier: arthur
Legacy accepted alias: artur
Display name: Arthur
```

### Required behavior

- New mobile persistence writes `arthur`.
- Mobile preference hydration accepts both `arthur` and legacy `artur`.
- Legacy `artur` must normalize to `arthur`, not fall back to Dana.
- API adapters must explicitly translate to the backend identifier expected by the existing endpoint when required.
- Backend compatibility must not be silently broken.
- Asset filenames may remain `Artur.*`; asset paths are not business identifiers.
- Add tests proving legacy preference preservation and API boundary translation.

Do not perform a broad mechanical rename across unrelated historical data unless required by the boundary implementation.

---

## 3. Extract runtime controllers

Extract three focused hooks/controllers from `LiveScreen.tsx`.

Suggested boundaries:

```text
mobile/src/features/live/useDriveDiscoverySession.ts
mobile/src/features/live/useGuidedTourDemo.ts
mobile/src/features/live/useExploreNarrative.ts
```

Names may vary if the existing repository structure suggests better canonical placement.

### A. Drive controller

Owns:

- session ID;
- session errors;
- start/stop/ping lifecycle;
- timer/ref cleanup;
- mute/playback state currently coupled to the Drive backend flow;
- backend presentation mapping inputs;
- last motion and result.

Must not own:

- map layout;
- Tour Preferences;
- Guided Tour demo state;
- visual styles.

### B. Guided Tour demo controller

Owns:

- `GuidedTourState`;
- location-event index;
- narrative timer;
- auto-continue timer;
- start/pause/resume/continue/stop actions;
- guide/language lock during the active tour;
- current target and narrative-derived state required by the view model.

Must not own:

- React Native views;
- Guide Profile UI;
- Share Preview UI;
- backend Drive API calls.

### C. Explore narrative controller

Owns:

- selected Explore narrative target;
- Explore playback/pause state;
- trigger/close/pause/resume actions;
- active Explore narrative derivation.

Must not own:

- guided route metadata;
- Drive session state;
- Tour Preferences.

---

## 4. `LiveScreen` target responsibility

After extraction, `LiveScreen` should primarily:

- read identity/preferences/localization;
- compose the three controllers;
- derive the typed foreground phase;
- create screen view models;
- route callbacks into extracted views;
- own temporary navigation overlays that do not belong to a controller.

Do not set an arbitrary line-count target. The acceptance criterion is responsibility separation, not cosmetic line reduction.

However, the final report must state the before/after line count and explain any remaining large sections.

---

## 5. Web dependency decision

Review:

- `react-dom`;
- `react-native-web`;
- `web` script;
- `react-native-maps` incompatibility.

Choose one explicit outcome:

### Option A — supported web shell

Keep dependencies only if there is a documented supported web entry strategy that does not claim map screens work when they do not.

### Option B — native-only MVP

Remove dependencies added solely for an unsuccessful screenshot attempt and document iOS/Android as the current supported mobile targets.

Do not keep unused dependencies merely because Expo Doctor passes.

---

## 6. Behavior preservation

Verify unchanged behavior for:

- guest Explore;
- Tour Preferences;
- guide selection;
- legacy Arthur preference hydration;
- language selection;
- active-session language lock;
- Guided Tour start;
- navigation progression;
- pause/resume;
- transcript open/close and return phase;
- Continue / auto-continue;
- End Tour confirmation;
- Tour Complete;
- Save/Share surfaces;
- authenticated Drive session start/ping/finish/stop;
- dev location simulation and Task 002 screenshot harness.

---

## 7. Tests required

Add or update automated tests for:

1. `artur` persisted preference normalizes to `arthur`;
2. valid `arthur` remains `arthur`;
3. unknown guide values use the documented fallback;
4. API adapter emits the expected legacy/backend identifier where required;
5. Guided Tour controller locks guide/language after start;
6. mode switching resets only the intended controller;
7. Drive controller cleans intervals on stop/unmount;
8. Explore narrative controller does not leak route metadata;
9. existing foreground selector tests remain green.

Do not replace behavioral tests with source regex checks.

---

## 8. Required verification

Run:

```bash
cd mobile && npm run typecheck
cd mobile && npm run test:presentation
cd mobile && npx expo-doctor
npm run test --workspace server
```

Also run any new focused tests directly and report their names.

---

## 9. Screenshot evidence

Since this is primarily an internal architecture checkpoint, provide only regression screenshots for:

1. Explore Home;
2. Tour Preferences with Arthur selected from a legacy `artur` persisted value;
3. Guided Navigation;
4. Active Story;
5. Transcript open;
6. Transcript closed/restored;
7. Drive idle/authenticated surface if testable without exposing secrets.

Store under:

```text
docs/codex-coordination/screenshots/task-003/
```

Screenshots must be produced from the implementation commit.

---

## 10. Required report

Create:

```text
docs/codex-coordination/REPORT_003_RUNTIME_CONTROLLERS_AND_GUIDE_ID_COMPATIBILITY.md
```

Include:

- implementation commit SHA;
- architecture before/after;
- controller interfaces;
- guide ID compatibility matrix;
- web dependency decision;
- files changed;
- tests and exact results;
- regression table;
- screenshot paths;
- known deviations;
- remaining `LiveScreen` responsibilities;
- final status.

Use one final status:

- `READY FOR ARCHITECTURE REVIEW`
- `NOT READY — BLOCKERS REMAIN`

---

## Definition of done

- legacy `artur` preference no longer silently becomes Dana;
- canonical mobile code uses `arthur`;
- backend compatibility is explicit and tested;
- Drive, Guided Tour, and Explore runtime state are extracted from `LiveScreen`;
- UI and backend behavior remain unchanged;
- dependency decision is documented and reflected in package files;
- required tests pass;
- screenshots and report are committed;
- no unresolved blocking regression remains.
