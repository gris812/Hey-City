# RUNBOOK 005 - AHEAD DISCOVERY FIELD TEST

Status: READY FOR FIELD TEST

## 1. Required Environment

Backend environment:

- `GOOGLE_MAPS_API_KEY` - required for live Google Geocoding and Places API calls.
- `JWT_SECRET` - required for authenticated mobile sessions outside local defaults.
- `AHEAD_DISCOVERY_PROVIDER_REFRESH_MINUTES` - optional, default `60`, allowed range `15..240`.
- `AHEAD_DISCOVERY_EVALUATION_SECONDS` - optional, default `20`.
- `AHEAD_DISCOVERY_MAX_HEADING_DELTA_DEGREES` - optional, default `70`.
- `AHEAD_DISCOVERY_TARGET_DISTANCE_MIN_M` - optional, default `500`.
- `AHEAD_DISCOVERY_TARGET_DISTANCE_MAX_M` - optional, default `25000`.
- `AHEAD_DISCOVERY_PROVIDER_LIMIT` - optional, default `12`.
- `AHEAD_DISCOVERY_SEARCH_RADIUS_M` - optional, default `12000`.
- `AHEAD_DISCOVERY_PROJECTED_DISTANCE_M` - optional, default `10000`.
- `GOOGLE_PLACES_NEW_FIELD_MASK` - optional, default `places.id,places.displayName,places.location,places.types,places.rating,places.userRatingCount`.

## 2. Run Backend And Mobile

Backend:

```bash
npm run dev --workspace server
```

Mobile:

```bash
cd mobile
npm start
```

Use a real device for the field test. The prototype is intended for real GPS movement, not a predefined route.

## 3. Enable Diagnostics

1. Sign in or create an account in the mobile app.
2. Open Explore.
3. Switch to Drive Discovery.
4. Start a Drive Discovery session.
5. Keep the session open while the passenger observes the `Ahead Discovery diagnostics` panel.

## 4. Change Provider Refresh Interval

Set `AHEAD_DISCOVERY_PROVIDER_REFRESH_MINUTES` before starting the backend:

```bash
AHEAD_DISCOVERY_PROVIDER_REFRESH_MINUTES=15 npm run dev --workspace server
```

The default is `60` minutes. Do not set values below `15`; config validation rejects out-of-range values.

## 5. Force Manual Refresh

In the diagnostic panel, tap `Force refresh`. The mobile app sends the current location, heading, speed, and GPS accuracy to:

```text
POST /drive/session/ahead-discovery/refresh
```

Expected result: `providerRefresh.forced` is `true` in the returned diagnostic payload, unless the provider refresh is already in progress.

## 6. Expected Debug Fields

The diagnostic panel should show:

- current movement latitude and longitude;
- speed, heading, and GPS accuracy;
- provider name;
- configured provider refresh interval;
- next provider refresh time;
- manual refresh status;
- selected target name, type, score, distance, bearing, heading delta, and reasons;
- hold reason when no target is selected;
- total, eligible, and excluded candidate counts;
- top candidates;
- excluded candidates and exclusion reasons.

## 7. Identify A Target-Behind Error

A target-behind problem usually appears as one of these signals:

- diagnostic decision hold reason is `no_candidate_ahead`;
- excluded candidate reason is `behind_user`;
- candidate heading delta is greater than `AHEAD_DISCOVERY_MAX_HEADING_DELTA_DEGREES`;
- server logs contain `ahead_discovery_candidate_filtered` with `exclusionReason: "behind_user"`.

If a visually obvious forward target is excluded as behind, capture the current heading, coordinates, candidate name, and timestamp.

## 8. Capture Driving Logs

Run the backend in a terminal and save console output for the drive window. Ahead Discovery logs are structured JSON lines with these event names:

- `ahead_discovery_provider_refresh_started`
- `ahead_discovery_provider_refresh_completed`
- `ahead_discovery_provider_refresh_failed`
- `ahead_discovery_candidate_filtered`
- `ahead_discovery_target_selected`
- `ahead_discovery_target_retained`
- `ahead_discovery_target_replaced`
- `ahead_discovery_hold`

Each event should include `sessionId` so the field-test session can be isolated.

## 9. Known Prototype Limitations

- Real target quality has not been validated until a field test is performed.
- There is no shared spatial or corridor cache in TASK-005.
- Candidate evaluation is deterministic and provider-neutral, but provider freshness still depends on Google availability and quota.
- The mobile UI is a diagnostic surface, not a production user experience.
- The prototype does not generate stories, TTS, or LLM output for Ahead Discovery targets.
- Heading quality depends on device GPS and motion state; slow or noisy movement can produce `missing_heading`, `bad_gps`, or `stale_gps` holds.

## 10. Safety

The driver must not interact with the device while driving. A passenger should observe diagnostics, force refreshes, and capture notes.

