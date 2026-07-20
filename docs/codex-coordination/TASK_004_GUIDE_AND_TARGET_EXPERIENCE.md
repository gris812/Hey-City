# TASK 004 — Guide Layer, Approaching Target, and At Target Experience

**Status:** Approved for implementation  
**Priority:** P1  
**Depends on:** TASK 002, TASK 003  
**Primary objective:** Complete the missing City Signal v1 guide-discovery and POI-arrival states without changing backend contracts, route logic, discovery logic, or the accepted navigation architecture.

---

## 1. Scope boundaries

This checkpoint is intentionally limited to:

1. Guide Quick Preview bottom sheet for Dana and Arthur;
2. explicit `Approaching Target` foreground state;
3. explicit `At Target` foreground state;
4. POI image and no-image fallback behavior;
5. stronger runtime-controller integration tests;
6. GitHub Actions validation for the current test suites;
7. fresh screenshots for all changed states.

Do not implement:

- creator tools;
- marketplace;
- portable/shared tour import;
- public remix;
- new backend endpoints;
- route reordering or replacement;
- adaptive narrative-continuity engine;
- new provider integrations;
- production LLM/TTS work;
- broad Settings redesign;
- Stories redesign;
- new sharing behavior.

Preserve the architectural rule that the mobile app presents backend/session state and must not make DiscoveryTarget, trigger-timing, route, or narrative-planning decisions.

---

## 2. Mandatory audit before coding

Before implementation, inspect and report:

- current `LiveForegroundPhase` and how `guided_approaching` is selected;
- current transition from `arrived` to `beginNarrative` in the Guided Tour demo controller;
- current guide-card tap behavior in `TourPreferencesSheet`;
- current full-screen Guide Profile implementation;
- current target/media data available in `tourBTargets` and related demo fixtures;
- existing image assets and their licensing/source status;
- current modal/overlay ownership in `LiveScreen`;
- existing tests that cover guide selection, location progression, story start, and transcript behavior.

Do not start coding until the audit identifies the exact files to change.

---

## 3. Guide Quick Preview

### 3.1 Purpose

Add a compact guide-details bottom sheet between Tour Preferences and the optional full-screen Guide Profile.

This is a separate surface from:

- compact guide selection cards;
- full-screen Guide Profile 02B/02C.

### 3.2 Entry flow

```text
Tour Preferences
→ tap guide portrait or explicit info affordance
→ Guide Quick Preview
```

From Guide Quick Preview:

```text
Choose Guide
→ close sheet
→ return to Tour Preferences with guide selected
```

or:

```text
View Full Profile
→ close quick preview
→ open existing full-screen Guide Profile
```

The full profile remains optional and must not block Start Walk.

### 3.3 Required content

#### Dana

- portrait/avatar;
- name: `Dana`;
- role: `Urban Companion`;
- short copy: `Warm, curious, and conversational.`;
- suggested interests:
  - Hidden Gems
  - Local Life
  - Atmosphere
- primary CTA: `Choose Dana`;
- secondary action: `View Full Profile`.

#### Arthur

- portrait/avatar;
- name: `Arthur`;
- role: `Historian`;
- short copy: `Analytical, architectural, and precise.`;
- suggested interests:
  - History
  - Architecture
  - Context
- primary CTA: `Choose Arthur`;
- secondary action: `View Full Profile`.

### 3.4 Behavior rules

- guide selection changes only the pre-tour preference;
- selecting a guide may suggest interests but must not restrict other interests;
- do not start the tour automatically;
- do not open full Settings;
- do not add favorite/heart behavior;
- only one overlay may be active;
- closing the sheet returns to Tour Preferences;
- selected state must not rely on color alone;
- use canonical mobile guide IDs: `dana`, `arthur`;
- preserve legacy `artur` compatibility through the adapters implemented in TASK 003.

### 3.5 Accessibility

- bottom sheet must be dismissible by explicit close/back action;
- screen-reader focus moves into the sheet when opened and returns to the triggering guide card when closed, where supported;
- minimum 44 px touch targets; prefer 48 px;
- accessible labels must include guide name, role, and selected status;
- support Dynamic Type and small viewports;
- do not make drag gesture the only dismissal mechanism.

---

## 4. Explicit Approaching Target state

### 4.1 Product purpose

The user must be able to distinguish:

```text
Navigating
→ Approaching Target
→ At Target
→ Story Active
```

`Approaching Target` is not a narration state and must not display the full story card.

### 4.2 State-model requirement

The existing `guided_approaching` phase must become a real, reachable foreground state driven by existing Guided Tour location progression.

Do not invent a second independent arrival state machine in the view layer.

The Guided Tour controller remains the source of deterministic demo progression.

### 4.3 Required UI

Map remains the primary surface.

Display:

- emphasized current POI marker;
- target name;
- message: `Story begins when you arrive`;
- available distance or ETA;
- stop progress;
- compact guide identity;
- one safe primary action only if already supported by current product logic.

Example:

```text
Approaching Federal Hall
Story begins when you arrive
About 1 min away
```

### 4.4 Map treatment

Preferred, when reliable with the current map stack:

- tighter camera framing around the target;
- subtle pitch/3D treatment;
- brighter or outlined target marker;
- completed route remains subdued;
- upcoming segment remains branded orange.

Required fallback:

- if pitch/3D cannot be implemented reliably, use a 2D close-range map with stronger target emphasis;
- reduced-motion mode must avoid non-essential animated camera transitions;
- GPS jitter must not repeatedly retrigger the entering animation.

### 4.5 Walking and driving

Walking:

- normal map context;
- readable short status;
- transcript/story not yet active.

Driving:

- audio-first;
- minimal text;
- large controls only;
- no guide switch;
- no dense image card while moving.

Do not add Drive as a tab.

---

## 5. Explicit At Target state

### 5.1 Product purpose

`At Target` is a short arrival surface between movement and narration.

It prepares the user for the story without turning the app into a photo-article reader.

### 5.2 State transition

Current demo logic must no longer transition directly from arrival into `beginNarrative` without rendering an arrival state.

Required conceptual flow:

```text
arrived
→ guided_at_target
→ user starts story or approved autoplay delay fires
→ guided_story_active
```

Add the smallest necessary deterministic state or controller transition.

Do not move this decision into an LLM or image component.

### 5.3 Foreground phase

Add a typed foreground phase if one does not already exist:

```ts
'guided_at_target'
```

Update selector tests accordingly.

### 5.4 At Target with image

Required layout:

- POI image as a supporting header/card, not a full-screen dark article;
- target name;
- type/category or short context label;
- guide identity;
- stop progress;
- primary CTA: `Start Story`;
- map context remains reachable or partially visible;
- transcript is not shown before the story starts.

### 5.5 At Target without image

No broken placeholder and no empty image container.

Fallback layout:

- warm place card;
- target name;
- category/context;
- branded target marker or map crop;
- guide identity;
- primary CTA: `Start Story`.

### 5.6 Media contract

Use a typed optional media field in the demo target/presentation model where appropriate.

Example shape:

```ts
type TargetMedia = {
  imageSource?: ImageSourcePropType;
  imageAlt?: string;
  attribution?: string;
};
```

Rules:

- media remains optional;
- views must render correctly without media;
- no remote image URL should be added without a documented source and failure behavior;
- image failure must switch to the fallback card;
- image must not be the only source of target identity.

### 5.7 Autoplay behavior

Preserve the current product preference model.

- if autoplay is enabled and current demo logic supports it, use a short deterministic arrival delay before narration;
- if autoplay is disabled, wait for `Start Story`;
- no hidden immediate transition that prevents the user from seeing the arrival state;
- add tests for both branches.

---

## 6. Runtime controller testing hardening

TASK 003 tests verified pure helpers but did not fully mount and exercise the hooks.

Add integration-level hook tests or equivalent deterministic controller harness tests.

Do not rely only on source-regex checks.

### 6.1 Drive controller

Verify:

- start creates the expected session state;
- authenticated start calls the API once;
- ping interval is created once;
- stop clears the interval;
- unmount clears the interval;
- no state update or ping occurs after cleanup;
- legacy/canonical guide conversion remains correct.

Mock:

- location provider;
- timers;
- API methods;
- profile loading.

### 6.2 Guided Tour controller

Verify through the real hook/controller behavior:

- guide and language can synchronize while idle;
- guide and language remain locked after Start Walk;
- progression reaches approaching;
- progression reaches at-target;
- autoplay starts narrative after the approved delay;
- autoplay-off waits for Start Story;
- pause/resume works;
- Continue and auto-continue remain correct;
- stop/reset clears timers and returns to idle.

### 6.3 Explore narrative controller

Verify:

- trigger opens Explore narrative;
- pause/resume/close work;
- reset clears state;
- no guided-route metadata is exposed.

### 6.4 Mode transition integration

Verify:

```text
Explore
→ Tour Preferences
→ Guided Tour
→ Explore
```

Expected:

- Guided Tour timers and state reset;
- Explore state is clean;
- no stale transcript or quick-preview overlay;
- no stale backend Drive session is created or retained unintentionally;
- foreground selector returns the correct single phase.

---

## 7. CI workflow

Create or update a GitHub Actions workflow that runs on push and pull request for relevant paths.

Minimum required jobs/steps:

```bash
cd mobile && npm ci
cd mobile && npm run typecheck
cd mobile && npm run test:presentation
npm run test --workspace server
```

`expo-doctor` may run as a separate non-flaky validation step if it is stable in CI.

Requirements:

- workflow must fail when required tests fail;
- use a supported Node version consistent with the repository;
- use dependency caching where straightforward;
- do not require secrets;
- do not launch simulator UI in CI;
- document any excluded checks and rationale.

---

## 8. Localization and copy

All new user-facing copy must be added through the existing localization mechanism.

Required languages:

- English;
- Russian.

Check:

- Tour Preferences with Quick Preview;
- Approaching Target;
- At Target;
- Start Story CTA;
- no-image fallback;
- small viewport;
- increased text size.

Do not hardcode English copy directly inside reusable view components.

---

## 9. Required screenshots

Capture fresh simulator screenshots from the implementation commit.

Store under:

```text
docs/codex-coordination/screenshots/task-004/
```

Required:

1. Dana Quick Preview;
2. Arthur Quick Preview;
3. Dana Full Profile regression;
4. Arthur Full Profile regression;
5. Guided Navigation regression;
6. Approaching Target — walking;
7. At Target with image;
8. At Target without image fallback;
9. Active Story after Start Story;
10. Transcript open regression;
11. Tour Preferences with Quick Preview closed and guide selected;
12. Russian Approaching or At Target screen;
13. smallest supported iPhone viewport;
14. driving-safe approaching surface if reachable without credentials.

Screenshots must be generated from the committed code and listed by path in the report.

---

## 10. Required automated checks

Run and report exact results:

```bash
cd mobile && npm run typecheck
cd mobile && npm run test:presentation
cd mobile && npx expo-doctor
npm run test --workspace server
```

Also report:

- new focused hook/integration test commands;
- GitHub Actions workflow result or commit status after push;
- any skipped or flaky check.

---

## 11. Required implementation report

Create:

```text
docs/codex-coordination/REPORT_004_GUIDE_AND_TARGET_EXPERIENCE.md
```

Include:

### A. Implementation commit

- commit SHA;
- branch;
- working-tree status.

### B. Audit summary

- files inspected;
- actual pre-change state flow;
- exact changes required.

### C. Architecture changes

- foreground phases before/after;
- Guided Tour controller transitions;
- overlay ownership;
- target-media contract;
- component tree.

### D. Files changed

For each file:

- purpose;
- change summary;
- risk level.

### E. Functional regression table

| Flow | Result | Evidence |
|---|---|---|
| Explore | | |
| Tour Preferences | | |
| Dana Quick Preview | | |
| Arthur Quick Preview | | |
| Full Guide Profile | | |
| Guided Navigation | | |
| Approaching Target | | |
| At Target image | | |
| At Target fallback | | |
| Story start | | |
| Pause/resume | | |
| Transcript | | |
| Mode switch | | |
| Drive session | | |

### F. Tests

- commands;
- pass/fail counts;
- failures;
- skipped tests;
- CI result.

### G. Screenshot review

For each required screenshot:

- file path;
- state shown;
- match/deviation from City Signal v1;
- localization/accessibility notes.

### H. Known deviations

Separate:

- blockers;
- acceptable MVP deviations;
- post-MVP opportunities.

### I. Final status

Use exactly one:

- `READY FOR DESIGN AND ARCHITECTURE REVIEW`
- `NOT READY — BLOCKERS REMAIN`

Do not claim readiness while required screenshots, tests, or states are missing.

---

## 12. Acceptance criteria

### Guide layer

- compact Quick Preview exists for Dana and Arthur;
- Quick Preview and Full Profile remain separate surfaces;
- guide selection returns to Tour Preferences;
- no automatic tour start;
- interests are suggestions, not restrictions;
- accessibility and localization requirements are met.

### Approaching

- `guided_approaching` is reachable and visually distinct;
- map remains primary;
- target is emphasized;
- reduced-motion fallback exists;
- narration is not active yet.

### At Target

- typed At Target foreground state exists;
- image state works;
- no-image fallback works;
- image error falls back safely;
- Start Story works;
- autoplay behavior is explicit and tested;
- no transcript/story overlap exists.

### Architecture

- no backend contract or discovery decision is moved to mobile views;
- only one foreground phase and one overlay are active;
- TASK 002 foreground separation remains intact;
- TASK 003 runtime-controller boundaries and guide-ID compatibility remain intact.

### Testing and delivery

- hook/integration coverage is added;
- required local tests pass;
- GitHub Actions is active and green;
- all required screenshots and the implementation report are committed;
- no blocking regression remains.
