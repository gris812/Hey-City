# REVIEW 002 — Presentation Architecture

**Reviewed implementation:** `006e255b9fdf704ecee95ec0ba96132e83574553`  
**Report correction:** `bb3b89135fe3abca4c87da43086cb1366c1dd82a`  
**Decision:** ACCEPT WITH REQUIRED FOLLOW-UP

## Verified

- `LiveForegroundPhase` was introduced as a typed foreground selector.
- Explore no longer presents fixed Guided Tour route metadata as its primary state.
- `ExploreHomeView`, `GuidedNavigationView`, `ActiveStoryView`, `TranscriptSheet`, and `TourPreferencesSheet` were extracted.
- Navigation, active story, story complete, and transcript now have explicit foreground separation.
- Transcript uses a return phase rather than an independent boolean-only presentation path.
- A new `liveForeground.test.ts` regression test is included in `test:presentation`.
- Mobile typecheck, presentation tests, Expo doctor, and server tests are reported as passing.
- No backend session API redesign was introduced.

## Architecture assessment

The checkpoint fixes the immediate P0 presentation-overlap problem, but it does not complete the mobile architecture correction.

`LiveScreen.tsx` decreased from approximately 1719 to 1646 lines. It remains responsible for:

- backend Drive session lifecycle;
- deterministic Guided Tour controller integration;
- Explore narrative state;
- product mode state;
- guide/preferences/profile overlays;
- completion/save/share states;
- map-derived view models;
- screenshot/development harness behavior.

The extracted components improve rendering boundaries, but `LiveScreen` is still a state-heavy coordinator rather than a thin composition root.

This is acceptable as an intermediate checkpoint, not as the final architecture state.

## Important findings

### 1. Guide identifier compatibility remains unresolved

The current split is:

- canonical mobile identifier: `arthur`;
- legacy backend/fixture identifier: `artur`;
- display name: `Arthur`;
- legacy asset filenames: `Artur.*`.

Existing persisted `artur` mobile preferences can silently fall back to Dana. This must be fixed at persistence/API boundaries before more guide-dependent functionality is added.

### 2. Dependency expansion requires justification

`react-dom` and `react-native-web` were added while the report also states that the app cannot render on web because of `react-native-maps`.

These packages should either:

- be justified as an intentional future-supported web shell dependency; or
- be removed if they were added only to attempt screenshot capture.

Do not keep dependencies without an active supported use case.

### 3. Screenshot evidence exists but visual approval is separate

The repository contains the requested Task 002 screenshot set. Architecture acceptance is based on code boundaries, state selection, tests, and the implementation report.

Visual fidelity must still be reviewed against the City Signal reference before the relevant screens are declared design-complete.

### 4. Test quality improved but remains incomplete

`liveForeground.test.ts` is a useful pure regression test. The existing `citySignalUiContract.test.cjs` remains a source-string smoke test and must not be treated as behavioral UI validation.

Future checkpoints should add tests around controller/view-model boundaries rather than expanding regex assertions.

## Decision by requirement

| Requirement | Decision |
|---|---|
| Typed foreground selector | Accepted |
| Explore / Guided separation | Accepted |
| Navigation / Story / Transcript exclusivity | Accepted |
| Extracted view components | Accepted |
| Existing functionality preserved | Accepted based on reported test suite |
| `LiveScreen` as thin composition root | Not yet achieved |
| Guide ID compatibility | Blocking follow-up |
| Screenshot capture | Supplied |

## Next checkpoint

Proceed with a second architecture checkpoint before adding new visual features.

The next checkpoint must:

1. resolve `artur` / `arthur` compatibility explicitly;
2. extract the three runtime controllers from `LiveScreen`;
3. keep current UI and backend behavior unchanged;
4. decide whether web dependencies are intentional;
5. provide fresh regression screenshots only for screens affected by the extraction.

## Final status

`TASK 002 ACCEPTED AS INTERMEDIATE ARCHITECTURE CHECKPOINT`

Not yet ready to mark the overall mobile architecture correction complete.
