# Cost Audit — Google Maps and Generative AI

Date: 2026-09-07  
Scope: current `main` production WebApp/backend paths.

## Executive findings

1. Google Maps is currently the primary variable-cost risk.
2. Ahead Discovery correctly throttles provider refresh inside a session, but the cache is session-scoped. Starting a new session in the same place causes a fresh reverse-geocode + Nearby Search pair.
3. Nearby Search (New) requested `rating` and `userRatingCount`. Those fields promote the request from Nearby Search Pro to Nearby Search Enterprise. Discovery does not need them.
4. The WebApp constructs a new Google Map whenever the map view is rendered. Returning from Settings/Stories to Map therefore creates another Dynamic Map load.
5. The current drive/walking discovery path in `driveSession.ts` uses `createMockNarration()`; it does not call the OpenAI text/TTS service. OpenAI is configured in `narration.ts`, but that service is not wired into the active discovery path.

## Implemented in Cost Control v1

### Shared geographic provider cache

Ahead Discovery results are now cached by projected geohash/radius/limit rather than only by session state.

Default:

```
AHEAD_DISCOVERY_PROVIDER_CACHE_TTL_SECONDS=900
```

Effect:

- repeated logins/sessions in the same area reuse discovery results;
- session refresh throttling remains active;
- cache is short-lived enough for field testing.

Current cache abstraction is still in-memory. Production Redis migration remains required for multi-instance persistence.

### Nearby Search field mask

Default changed from:

```
places.id,places.displayName,places.location,places.types,places.rating,places.userRatingCount
```

to:

```
places.id,places.displayName,places.location,places.types
```

Reason: rating fields are not required for first-pass discovery. Popularity enrichment should happen only after deterministic candidate selection when it materially improves the product.

### Cost telemetry

Existing usage telemetry already separates:

- `dynamic_map_load`
- `places_nearby_new`
- `reverse_geocoding`
- `distance_matrix`
- OpenAI text
- OpenAI TTS

This is sufficient for first-pass unit economics, but it should be extended with cache-hit metadata and per-session totals.

## Remaining P1 work

### Prevent repeated Dynamic Map construction

Current WebApp rendering destroys the Map DOM node when changing tabs and constructs a new `google.maps.Map` when returning.

Recommended change:

- keep the map screen mounted;
- switch top-level views using visibility/state rather than replacing the entire shell;
- construct exactly one Google Map per browser application lifecycle unless an explicit hard reset occurs.

Do not solve this by removing the map or degrading the map-first UX.

### Replace session memory cache with Redis-backed cache

The current cache module is documented as Redis-ready but actually stores values in process memory.

Required:

- Redis implementation behind the same `cacheGet/cacheSet` interface;
- fallback to in-memory when Redis is unavailable;
- cache-hit/miss telemetry;
- no provider-specific cache calls outside the cache abstraction.

## Generative model optimization

Do not add Gemma directly into business logic. Introduce an `AITaskRouter` / `GenerativeProvider` boundary first.

Suggested routing:

| Task | Preferred execution |
|---|---|
| POI normalization / category cleanup | deterministic code first; small/free model only if required |
| relevance classification | small/free model candidate |
| evidence cleanup / short factual compression | small/free model candidate |
| NarrativePlan | deterministic business logic |
| Dana/Arthur final narration | quality-controlled primary model |
| complex follow-up conversation | primary model |
| TTS | independent provider layer |

Before enabling Gemma in production, benchmark it against a fixed Hey City corpus for:

- factuality;
- Russian/English quality;
- persona adherence;
- latency;
- structured output;
- cost.

## Architectural rule

LLMs generate language. They do not decide what the user should hear, which POI wins, when narration starts, or how provider budgets are allocated.
