## 12. Target Stability

Implement minimal hysteresis so the target does not switch on every location update.

Requirements:

- retain the current target through minor heading jitter;
- replace the current target when it is behind, passed, invalid, or materially outranked;
- expose the reason for replacement;
- do not implement full story cooldown or long-term anti-repeat in this task unless reusable code already exists.

Suggested configuration:

```yaml
AHEAD_DISCOVERY_TARGET_SWITCH_SCORE_MARGIN: 0.15
AHEAD_DISCOVERY_HEADING_GRACE_SECONDS: 30
```

Exact representation may follow existing configuration conventions.

---

## 13. Backend API

Reuse current session APIs where practical.

Do not create a parallel session framework.

The backend response used by the mobile debug screen must expose:

- current normalized movement context;
- provider refresh status;
- provider refresh timestamp;
- next planned provider refresh timestamp;
- current selected target;
- target score;
- selection reasons;
- distance;
- bearing;
- heading delta;
- candidate count;
- included candidate count;
- excluded candidate count;
- exclusion reasons summary;
- hold reason when no target is selected;
- provider error state without exposing secrets or raw sensitive errors.

The exact endpoint may be:

- an extension of the current session ping response;
- a canonical discovery endpoint; or
- a developer-only diagnostic endpoint.

Prefer extending existing contracts over creating duplicate APIs.

All requests must be validated.

---

## 14. Mobile Debug Experience

Implement only enough UI to support field testing.

The diagnostic screen or developer panel must show:

### Current movement

- latitude/longitude;
- speed;
- native or derived heading;
- GPS accuracy;
- last GPS timestamp.

### Provider state

- provider name;
- last refresh time;
- next refresh time;
- configured refresh interval;
- loading/error state;
- manual refresh control.

### Selected target

- name;
- normalized target type;
- distance in miles and meters;
- bearing;
- heading delta;
- score;
- selection reasons.

### Candidate diagnostics

- total candidates;
- eligible candidates;
- excluded candidates;
- top candidate list;
- exclusion reason for filtered candidates when practical.

No production visual design is required.

Do not add narration playback, voice controls, guide switching, story cards, or account flows.

---

## 15. Logging and Field-Test Data

Add structured development logging for each provider refresh and target decision.

Minimum event types:

```text
ahead_discovery_provider_refresh_started
ahead_discovery_provider_refresh_completed
ahead_discovery_provider_refresh_failed
ahead_discovery_candidate_filtered
ahead_discovery_target_selected
ahead_discovery_target_retained
ahead_discovery_target_replaced
ahead_discovery_hold
```

Logs should include:

- session ID;
- timestamp;
- location rounded appropriately for development diagnostics;
- speed band;
- stable heading;
- candidate counts;
- selected target ID/name/type;
- score and reasons;
- exclusion reason;
- provider latency;
- provider error code when safe.

Do not log API keys, auth tokens, or raw secrets.

If an existing replay/session event mechanism exists, reuse it.

A full analytics platform is outside scope.

---

## 16. Error and Degraded Behavior

Implement safe behavior for:

- missing Google key;
- invalid provider configuration;
- Google timeout;
- Google quota or rate limit response;
- malformed provider response;
- no settlement or POI results;
- missing heading;
- bad or stale GPS;
- app network failure;
- manual refresh while another refresh is in progress.

Expected behavior:

- return a typed hold/degraded response;
- preserve the last valid candidate set in memory during the active process when safe;
- do not crash the mobile session;
- do not return raw Google errors to the mobile client;
- do not silently report success.

Persistent or distributed cache is not required.

---

## 17. Explicit Non-Goals

Do not implement:

- spatial cache;
- Redis-backed geographic cache;
- shared cross-user corridor cache;
- route planning;
- test-route dependency;
- navigation instructions;
- Google Routes integration unless strictly necessary for compiling existing code;
- LLM story generation;
- NarrativePlan generation for final prose;
- TTS;
- STT;
- voice input;
- guide personas;
- production UI redesign;
- account creation;
- saved places;
- long-term Personal City History;
- creator tours;
- knowledge graph ingestion;
- comprehensive US geographic database;
- automatic documentation rewrite across the whole repository.

---

## 18. Testing Requirements

Add deterministic tests for the business logic.

### 18.1 Geometry tests

- candidate directly ahead;
- candidate behind;
- candidate near heading boundary;
- heading wraparound near 0°/360°;
- distance calculation;
- missing native heading with derived fallback;
- stale location rejection.

### 18.2 Filtering tests

- restaurant excluded;
- gas station excluded;
- store excluded;
- local service excluded;
- historical landmark included;
- city/locality included;
- national park included;
- unknown ambiguous type excluded or marked low-confidence;
- behind target excluded regardless of category.

### 18.3 Scoring tests

- city ahead outranks low-priority park under expected conditions;
- historical landmark outranks general park under expected conditions;
- popularity does not override excluded category;
- current target is retained through small score changes;
- materially stronger candidate replaces current target.

### 18.4 Refresh tests

- provider refresh occurs when due;
- provider refresh does not occur on every GPS evaluation;
- 60-minute default loads from config;
- manual refresh forces a provider call;
- concurrent manual refresh is rejected or coalesced;
- invalid refresh configuration fails validation.

### 18.5 Provider adapter tests

Use mocks/fixtures for Google responses.

Test:

- normalization;
- Google type mapping;
- minimal field parsing;
- timeout;
- quota response;
- malformed result;
- empty result.

Do not require live Google calls in automated test suites.

---

