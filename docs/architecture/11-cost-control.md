# Cost Audit — Google Maps and Generative AI

Date: 2026-09-07  
Scope: current `main` production WebApp/backend paths.

## Executive findings

1. Google Maps is currently the primary variable-cost risk.
2. Ahead Discovery uses both session refresh throttling and a shared geographic provider cache. Empty provider results count as completed refreshes and must not be retried on every GPS ping.
3. Nearby Search (New) requested `rating` and `userRatingCount`. Those fields promote the request from Nearby Search Pro to Nearby Search Enterprise. Discovery does not need them.
4. Cost Control v2 keeps one Google Map instance mounted for the authenticated browser lifecycle.
5. Cost Control v2 routes Walking and Drive narration through the same plan-first generation boundary.

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

The operations dashboard renders these categories as a cost breakdown instead of presenting an unexplained aggregate. OpenAI text and TTS tokens remain separate, so a guide voice preview cannot be mistaken for a generated POI story.

This is sufficient for first-pass unit economics, but it should be extended with cache-hit metadata and per-session totals.

## Implemented in Cost Control v2

### Persistent Dynamic Map lifecycle

The WebApp mounts the map host once and switches Map / Stories / Settings with view visibility.
Returning to Map triggers a resize on the existing instance rather than constructing another map.

Cost effect:

- one Dynamic Map construction per authenticated browser lifecycle;
- switching away and back adds zero new Dynamic Map constructions;
- if a session previously returned to Map `N` times, map-construction count falls from `N + 1` to `1`.

The location watch, last point, active session, audio, and map camera remain intact across tabs.

### Empty-result refresh guard

A successful Google response with zero candidates is still a completed, billable provider refresh.
The session records its refresh timestamp and waits for the configured interval before trying again.
This prevents the previous worst case: two paid Google calls on every GPS update when nothing was found.
Provider failures use the same retry interval, preventing quota or configuration errors from becoming a tight retry loop.

### Narrative generation and AI task routing

- Walking and Drive create `NarrativePlan` deterministically and pass the exact plan into `NarrativeGenerator`.
- `AITaskRouter` maps task classes to registered `GenerativeProvider` adapters using env policy.
- final storytelling and complex follow-up route to OpenAI;
- normalization, classification, and evidence compression remain deterministic;
- Gemma is not connected in production;
- generated story cache keys include guide and prompt version, avoiding cross-persona cache reuse;
- provider failure falls back to deterministic narration, while TTS failure returns text-only narration.

Cost effect:

- deterministic auxiliary tasks have zero LLM inference cost;
- cached final stories avoid repeated text generation;
- cached audio avoids repeated TTS generation;
- generated MP3 files are reused from the persistent media volume after API restarts, including guide voice samples;
- future small-model adoption requires only a provider adapter and route change, not changes to Discovery.

## Remaining P1 work

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
