# REPORT 005 - AHEAD DISCOVERY FIELD PROTOTYPE

Status: READY FOR ARCHITECTURE REVIEW

Implementation checkpoint:

- Code/runbook/report commit: `c3a07e6726b8940abfe587e8c1b0eed921978da4`
- Branch: `main`

## 1. Summary Of Implemented Behavior

TASK-005 implements a minimal field-testable Ahead Discovery prototype for Drive Discovery without a predefined route.

The backend now receives real movement context from mobile pings, refreshes Google-backed candidate data on a configurable schedule, evaluates targets locally between provider refreshes, filters out unsuitable candidates, applies deterministic scoring and target stability, and returns diagnostics with the existing drive-session ping response. Mobile renders those diagnostics in the Drive Discovery session surface and provides a manual force-refresh action.

No real field quality validation has been performed yet.

## 2. Files Changed

Shared contracts:

- `shared/src/contracts/drive.d.ts`

Backend:

- `server/package.json`
- `server/src/config.ts`
- `server/src/controllers/drive.ts`
- `server/src/routes/drive.ts`
- `server/src/services/driveSession.ts`
- `server/src/services/aheadDiscovery.ts`
- `server/src/services/aheadDiscoveryFiltering.ts`
- `server/src/services/aheadDiscoveryGeometry.ts`
- `server/src/services/aheadDiscoveryScoring.ts`
- `server/src/services/aheadDiscoveryTypes.ts`
- `server/src/services/googleAheadDiscoveryProvider.ts`

Backend tests:

- `server/test/aheadDiscoveryFiltering.test.ts`
- `server/test/aheadDiscoveryGeometry.test.ts`
- `server/test/aheadDiscoveryRefresh.test.ts`
- `server/test/aheadDiscoveryScoring.test.ts`
- `server/test/googleAheadDiscoveryProvider.test.ts`

Mobile:

- `mobile/src/api/drive.ts`
- `mobile/src/features/live/useDriveDiscoverySession.ts`
- `mobile/src/screens/LiveScreen.tsx`

Coordination docs:

- `docs/codex-coordination/RUNBOOK-005-ahead-discovery-field-test.md`
- `docs/codex-coordination/REPORT-005-ahead-discovery-field-prototype.md`

## 3. API And DTO Changes

Shared DTO additions:

- `MovementContext`
- `CandidateGeometry`
- `DiscoveryCandidate`
- `AheadDiscoveryDecision`
- `AheadDiscoveryExcludedCandidate`
- `AheadDiscoveryDiagnostic`
- `AheadDiscoveryTargetType`
- `AheadDiscoveryHoldReason`

Existing drive ping response:

- `DrivePingResult.aheadDiscovery?: AheadDiscoveryDiagnostic`

Existing ping request now accepts:

- `accuracyMeters`
- `forceAheadRefresh`

New endpoint:

```text
POST /drive/session/ahead-discovery/refresh
```

The endpoint requires an authenticated drive session and returns:

```text
{ aheadDiscovery }
```

## 4. Config Variables Added

- `AHEAD_DISCOVERY_PROVIDER_REFRESH_MINUTES` - default `60`, allowed range `15..240`.
- `AHEAD_DISCOVERY_EVALUATION_SECONDS` - default `20`.
- `AHEAD_DISCOVERY_MAX_HEADING_DELTA_DEGREES` - default `70`.
- `AHEAD_DISCOVERY_TARGET_DISTANCE_MIN_M` - default `500`.
- `AHEAD_DISCOVERY_TARGET_DISTANCE_MAX_M` - default `25000`.
- `AHEAD_DISCOVERY_TARGET_SWITCH_SCORE_MARGIN` - default `0.15`.
- `AHEAD_DISCOVERY_HEADING_GRACE_SECONDS` - default `30`.
- `AHEAD_DISCOVERY_MAX_GPS_ACCURACY_M` - default `100`.
- `AHEAD_DISCOVERY_PROVIDER_TIMEOUT_MS` - default `4500`.
- `AHEAD_DISCOVERY_PROVIDER_LIMIT` - default `12`.
- `AHEAD_DISCOVERY_SEARCH_RADIUS_M` - default `12000`.
- `AHEAD_DISCOVERY_PROJECTED_DISTANCE_M` - default `10000`.
- `AHEAD_DISCOVERY_WEIGHT_AHEAD` - default `0.3`.
- `AHEAD_DISCOVERY_WEIGHT_DISTANCE` - default `0.22`.
- `AHEAD_DISCOVERY_WEIGHT_CATEGORY` - default `0.28`.
- `AHEAD_DISCOVERY_WEIGHT_POPULARITY` - default `0.1`.
- `AHEAD_DISCOVERY_WEIGHT_STABILITY` - default `0.16`.
- `GOOGLE_PLACES_NEW_FIELD_MASK` - optional Places API field mask override.

Existing required Google secret:

- `GOOGLE_MAPS_API_KEY`

## 5. Google APIs And Endpoints Used

Google calls are backend-side only.

Endpoints:

- Geocoding API: `https://maps.googleapis.com/maps/api/geocode/json`
- Places API (New) Nearby Search: `https://places.googleapis.com/v1/places:searchNearby`

The Geocoding call is used for settlement-style targets around a projected point ahead of the user. Places API is used for significant non-commercial destinations such as landmarks, parks, museums, visitor centers, and universities.

## 6. Provider Field Masks Used

Default Places API field mask:

```text
places.id,places.displayName,places.location,places.types,places.rating,places.userRatingCount
```

The field mask is configurable through `GOOGLE_PLACES_NEW_FIELD_MASK`.

## 7. Filtering And Scoring Rules Implemented

Geometry:

- validates latitude and longitude;
- derives heading from recent movement when device heading is missing;
- computes bearing, distance, heading delta, and `isAhead`;
- projects a search point ahead of current movement;
- rejects stale, inaccurate, or heading-less movement with typed hold reasons.

Filtering:

- allow-list-first target normalization;
- includes cities, towns, localities, regions, landmarks, parks, bridges, monuments, museums, universities, visitor centers, and other significant places;
- excludes restaurants, cafes, bars, food businesses, stores, gas stations, local services, lodging, car services, parking, banks, and unknown low-signal types;
- excludes objects behind the user.

Scoring:

- deterministic weighted score using ahead alignment, distance, category priority, popularity, and stability;
- target switch hysteresis via `AHEAD_DISCOVERY_TARGET_SWITCH_SCORE_MARGIN`;
- retains current target unless a challenger exceeds the margin;
- emits selected/retained/replaced target reasons.

## 8. Tests Added And Test Results

Tests added:

- geometry: `server/test/aheadDiscoveryGeometry.test.ts`
- filtering: `server/test/aheadDiscoveryFiltering.test.ts`
- scoring and hysteresis: `server/test/aheadDiscoveryScoring.test.ts`
- refresh scheduling and provider mocks: `server/test/aheadDiscoveryRefresh.test.ts`
- Google provider normalization and error handling: `server/test/googleAheadDiscoveryProvider.test.ts`

Local validation run:

- `npm run typecheck --workspace shared` - PASS
- `npm run typecheck --workspace server` - PASS
- `cd mobile && npm run typecheck` - PASS
- `npm run test --workspace server` - PASS
- `cd mobile && npm run test:presentation` - PASS
- `cd mobile && npx expo-doctor` - PASS, 18/18 checks

## 9. Field-Test Instructions

Use:

- `docs/codex-coordination/RUNBOOK-005-ahead-discovery-field-test.md`

Minimum test flow:

1. Configure backend with `GOOGLE_MAPS_API_KEY`.
2. Start backend and mobile.
3. Sign in on a real device.
4. Start Drive Discovery.
5. Observe `Ahead Discovery diagnostics`.
6. Capture selected target, hold reason, candidate counts, excluded candidates, and server JSON logs.
7. Use `Force refresh` only from the passenger seat.

## 10. Known Limitations

- Field quality has not been validated yet.
- No spatial or corridor cache exists in TASK-005.
- No Google cost profile has been measured yet.
- Provider freshness is per local in-memory drive session state.
- Diagnostics are developer-facing.
- Ahead Discovery does not yet create narrative content.
- Heading quality can be poor at low speeds or with noisy GPS.

## 11. Deviations From Task And Reasons

- The diagnostic UI was added inside the existing Drive Discovery session screen rather than as a separate new screen. Reason: the task asked to reuse existing session architecture where practical and avoid broad restructuring.
- No screenshots were added for TASK-005. Reason: the task asks for a field-test runbook and report, and the diagnostic UI depends on a live authenticated drive session with GPS/provider state.

## 12. Explicit Non-Goal Confirmation

Confirmed not implemented in TASK-005:

- spatial cache;
- LLM generation;
- TTS;
- story generation;
- production UI;
- route validation;
- predefined route behavior for Ahead Discovery.

## 13. Deferred Spatial-Cache Follow-Up

FOLLOW-UP - Add shared spatial/corridor cache after Ahead Discovery field validation.

Trigger for reconsideration:

- target identification quality is acceptable in real driving;
- Google call volume and cost are measured;
- repeated requests across the same corridor are observed;
- provider refresh behavior is stable.

Future cache evaluation should consider:

- geohash or corridor-based keys;
- shared reuse across users;
- cache TTL by target type;
- language-independent geographic candidate caching;
- separation of raw provider results from enriched narrative content.
