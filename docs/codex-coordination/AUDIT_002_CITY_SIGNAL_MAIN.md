# Audit 002 — City Signal v1 on `main`

**Audited commit:** `de206585d1fc9d96b73b056280baa0119962e30f`  
**Commit message:** `Implement City Signal v1 mobile refresh`  
**Status:** `NOT READY FOR CONTINUED UI EXPANSION`

## Executive conclusion

The City Signal implementation is now present on GitHub `main`. The visual refresh is substantial and the main navigation is aligned with the accepted three-tab structure. However, the current implementation has a real mobile presentation-architecture problem:

- `LiveScreen.tsx` owns product mode, backend Drive session lifecycle, deterministic Guided Tour simulation, Explore narrative demo, map rendering, Tour Preferences, guide profiles, transcript, completion, route save and Share Preview.
- the Explore screen leaks fixed Guided Tour metadata;
- Guided Navigation renders duplicate control systems;
- the story overlay and persistent navigation card remain visible together;
- transcript is implemented as a transparent modal over the already crowded screen;
- Drive Discovery remains a manually modeled product mode in the same screen even though the accepted product model treats driving as a runtime mobility/safety state;
- structural text-matching tests confirm strings exist but do not validate state exclusivity, behavior or visual hierarchy.

The next checkpoint must correct presentation architecture before adding more screens.

## Verified repository state

- Main City Signal commit exists on GitHub as `de206585...`.
- No GitHub Actions workflow run is attached to the commit.
- Mobile test command exists as `npm run test:presentation`.
- `citySignalUiContract.test.cjs` is a source-text contract test, not a rendered component or behavioral test.

## Architecture findings

### P0-1 — `LiveScreen.tsx` is a composition root, controller, state machine and view bundle

The file currently owns at least these independent responsibilities:

1. product mode selection;
2. authenticated Drive session start/ping/finish/stop;
3. local playback state;
4. deterministic Guided Tour state machine;
5. Tour B event simulation;
6. Explore narrative demo state;
7. map layout and route rendering;
8. Tour Preferences;
9. full guide profiles;
10. transcript;
11. tour completion;
12. route-save prompt;
13. Share Preview;
14. Drive settings;
15. responsive layout calculations.

This creates high regression risk and makes state overlap likely.

### P0-2 — Three state systems coexist without a canonical presentation selector

The screen combines:

- `mode`;
- authenticated Drive session state (`sessionId`, `lastResult`, `localPlaybackState`);
- local Guided Tour state (`tourState`);
- Explore narrative state;
- independent modal booleans.

There is no single typed selector that maps these into one active foreground phase and one overlay.

### P0-3 — Drive is hidden from the selector but remains a manually selectable product-mode branch

`drive_discovery` is filtered from visible mode chips, but it remains part of the screen mode union and owns a large manually rendered branch with settings. This is inconsistent with the accepted model:

- user-selected experience: Explore or Guided Tour;
- mobility state: Walking or Driving;
- driving UI activates from movement/speed and safety rules.

Do not remove working Drive functionality in the architecture checkpoint. Isolate it behind a runtime presentation adapter and stop expanding it as a third screen mode.

### P0-4 — Naming migration from `artur` to `arthur` crossed contracts

The refresh changed guide identifiers in documents, DTO examples and mobile preferences. This must be treated as a contract migration, not a copy change. Before further work, Codex must inventory every persisted preference, API validator, seed, shared type and backend DTO that uses `artur` or `arthur` and confirm backward compatibility or a migration path.

## Product and UX findings

### P1-1 — Explore leaks Guided Tour metadata

The Explore Guide Capsule contains:

- `Preview Route`;
- `Downtown Manhattan Walk`;
- `4 stops - 2.3 km - 52 min`;
- `Start Walk`.

This makes Explore look like a route catalogue instead of ambient discovery. Explore may offer a secondary entry into Guided Tour, but its primary content must be:

- current area;
- active guide;
- ambient discovery status;
- nearby/current DiscoveryTarget when available;
- no fixed stop count, route distance or route duration.

### P1-2 — Guided Navigation has duplicate controls

The map info card contains:

- compact icon controls in the header;
- a second full `Pause / Transcript / End Tour` row;
- `NarrativeOverlay` controls while narration is active.

This violates one-primary-focus and creates accidental-action risk.

### P1-3 — Story and Navigation surfaces are not exclusive

When narration is active, `NarrativeOverlay` is rendered while the persistent guided map info card remains present. The user sees both a story surface and a navigation/control surface.

Required behavior:

- `navigating`: navigation card only;
- `approaching`: approach card only;
- `story_active`: story surface only, with minimal map context;
- `story_complete`: next-stop decision surface;
- `transcript`: transcript is the sole foreground sheet.

### P1-4 — Transcript is a transparent overlay over crowded content

The transcript modal does not remove or suspend underlying readable content. This is visually noisy and weak for accessibility. It must be modeled as an exclusive overlay state and restore the previous phase on close.

### P1-5 — At Target is not a real state

The current implementation moves from arrival into `beginNarrative` and displays `NarrativeOverlay`. There is no distinct At Target presentation with:

- POI image where available;
- no-photo fallback place card;
- guide identity;
- transition into story.

This is a later checkpoint, after architecture correction.

### P1-6 — History empty state is semantically inconsistent

The empty state says `0 walks` while showing a populated-looking route map and markers. The map is being used as decorative future-content preview, but it reads as an existing saved route.

Required later fix:

- empty state uses a clearly illustrative/ghost route treatment;
- populated dev fixture exists behind a development-only flag for visual review;
- real guest/account history logic remains unchanged.

### P1-7 — Settings guide selection has weak information hierarchy

Settings includes Guide & Interests in title, but only guide portraits are shown. Interests are absent from this section. The guide modal is a centered glass popup, not the approved compact bottom sheet or full profile pattern. This is not part of Checkpoint 1.

## Test-quality findings

`citySignalUiContract.test.cjs` only checks source text and regex matches. It can pass when:

- screens overlap;
- controls are duplicated;
- a state is unreachable;
- a button exists but does not work;
- Explore still leaks Guided Tour metadata.

The test should remain as a lightweight guard, but it must not be used as proof of UI completion.

Checkpoint 1 requires pure state-selector tests and component-level behavior tests where feasible.

## Screen coverage assessment

| Screen/state | Coverage | Audit result |
|---|---|---|
| Explore Home | Implemented | Visually strong base; wrong fixed-route metadata |
| Tour Preferences | Implemented | Acceptable for MVP; keep in current flow |
| Guide Profile Dana/Arthur | Implemented | Optional full-screen flow exists |
| Guided Navigation | Implemented | Duplicate controls and state overlap |
| Approaching | Partial | Text box exists; no distinct presentation |
| At Target | Missing as a distinct state | No photo/fallback state |
| Active Story | Partial | Narrative overlay exists; competes with navigation surface |
| Transcript | Implemented | Not exclusive; transparent overlay over crowded content |
| Story Complete | Partial | `waiting_to_continue` exists but shares overlay model |
| Tour Complete | Implemented | Requires screenshot/functional review later |
| Stories empty | Implemented | Semantically misleading route preview |
| Stories populated | Runtime-dependent | Needs dev visual fixture later |
| Share Preview | Implemented | Requires functional and visual review later |
| Settings | Implemented | Interests summary and guide-detail pattern incomplete |
| Driving runtime UI | Existing legacy branch | Not aligned with automatic runtime-state model |

## Required implementation order

1. Checkpoint 1 — presentation architecture, Explore/Guided separation, Story/Transcript exclusivity.
2. Checkpoint 2 — Guide Quick Preview, Approaching and At Target/photo fallback.
3. Checkpoint 3 — Stories fixture and semantic cleanup, Completion and Share review.
4. Checkpoint 4 — Drive runtime/safety-state review.

## Final recommendation

`NOT READY — ARCHITECTURE CHECKPOINT REQUIRED`
