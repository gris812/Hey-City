# 10 — Provider Integration

## Purpose

This document defines boundaries for external providers.

Providers should be added only after deterministic core is stable.

## Provider map

```mermaid
flowchart TD
    API[Backend API] --> Maps[Google Maps Platform]
    API --> LLM[OpenAI LLM]
    API --> Gemini[Gemini Grounding]
    API --> STT[OpenAI STT]
    API --> TTS1[OpenAI TTS]
    API --> TTS2[ElevenLabs TTS optional]
    API --> R2[Cloudflare R2]
    API --> Redis[Redis / Upstash]
    API --> DB[(PostgreSQL)]

    Maps --> M1[Places]
    Maps --> M2[Directions]
    Maps --> M3[Distance Matrix]
    Gemini --> G1[Google Maps Grounding]
    Gemini --> G2[Google Search Grounding]

    LLM --> G[Story text from NarrativePlan]
    Gemini --> G
    TTS1 --> A[Generated audio]
    TTS2 --> A
    A --> R2
```

## MVP provider decisions

| Area | MVP decision |
|---|---|
| Map | Google Maps SDK |
| POI discovery | Google Places on backend only |
| ETA/distance | Google Distance Matrix / Directions on backend only |
| LLM | OpenAI |
| Grounded narrative | Gemini Maps/Search behind `GroundedNarrativeProvider`; standard generator remains fallback |
| STT | OpenAI |
| TTS | OpenAI first |
| Premium TTS | ElevenLabs optional |
| Audio storage | Cloudflare R2 |
| Cache | Redis / Upstash |
| DB | PostgreSQL |

## Integration order

Recommended order:
1. deterministic local seed
2. Redis cache / rate limits
3. Google Places sandbox integration
4. Google ETA integration
5. OpenAI LLM from NarrativePlan
6. OpenAI TTS
7. Cloudflare R2 audio cache
8. ElevenLabs voice experiment

## Accepted grounded narrative contour

Grounding is an optional narrative-generation path, not a replacement for deterministic
Discovery or `NarrativePlan`.

```ts
type GroundingMode = "maps" | "search";

type GroundedNarrativeResult = {
  text: string;
  provider: string;
  groundingMode: GroundingMode;
  citations: Array<{ title: string; url: string }>;
  attribution?: {
    displayText?: string;
    links: Array<{ title: string; url: string }>;
  };
  policy: {
    mayCache: boolean;
    mayTransform: boolean;
    expiresAt?: string;
  };
};
```

Routing rules:

- Gemini Maps Grounding is eligible only for English POI narratives with clear geographic intent.
- Gemini Search Grounding is eligible for other supported languages and for official, municipal,
  historical, or local web sources.
- Maps-grounded output and its attribution metadata stay together through API, UI, transcript, and
  session history.
- Maps data is not promoted into the reusable evidence store.
- If grounding is unavailable, too slow, over budget, unsupported for the requested language, or
  cannot satisfy attribution requirements, route to the standard evidence-based generator.
- TTS may speak the returned narrative, but the visual transcript must retain required citations
  and attribution.
- Provider selection, budget limits, timeout, and fallback order are config-driven.

## Cost-control rules

Provider cost is part of architecture, not an after-the-fact billing concern.

- Discovery provider results are cached by projected geographic cell, not by user session. A new login or session in the same area must not automatically trigger another Google discovery call.
- `Nearby Search (New)` uses only the minimum discovery field mask: place ID, display name, location, and types. Rating and `userRatingCount` are intentionally excluded from the discovery request because they promote the request to a higher billing tier; popularity can be enriched later only for a selected target when product value justifies it.
- Session-level refresh throttling remains in addition to the shared geographic cache.
- Place Details is allowed only after deterministic ranking selects a target.
- ETA/matrix requests are allowed only for the reduced candidate set and must use cache/deduplication.
- Client-side Dynamic Map loads are tracked separately from backend Places/Geocoding usage.
- LLM generation remains behind `AITaskRouter` so deterministic tasks do not consume premium model inference. Walking and Drive both pass their authoritative `NarrativePlan` to `NarrativeGenerator`; OpenAI is currently the only registered production `GenerativeProvider`.

## AI task routing

Routing is static, config-driven business policy. It is not an LLM decision.

| Task | Current route | Future eligibility |
|---|---|---|
| `final_storytelling` | `openai` | quality-controlled primary model only |
| `complex_follow_up` | `openai` | quality-controlled primary model |
| `evidence_compression` | `deterministic` | benchmarked small/free model |
| `poi_normalization` | `deterministic` | deterministic first; small model only if justified |
| `relevance_classification` | `deterministic` | benchmarked small/free model |

Production defaults:

```text
AI_PRIMARY_PROVIDER=openai
AI_AUXILIARY_PROVIDER=deterministic
NARRATIVE_PROMPT_VERSION=v1
```

Gemma is not registered and has no production credentials or route. Adding it later requires a
`GenerativeProvider` adapter, corpus benchmark, explicit route change, and unchanged deterministic
Discovery/NarrativePlan boundaries.

## Provider failure handling

Every provider adapter must return safe degraded responses.

Examples:
- Google quota reached -> use local seed or cached POIs
- ETA failure -> distance fallback
- LLM failure -> deterministic mock story
- TTS failure -> text-only response
- object storage failure -> direct text/mock audio unavailable
- Redis failure -> continue with reduced caching if safe
- STT failure -> disable voice input but preserve map/audio loop

## Security rules

- no Google Places/Directions/Matrix keys in mobile
- no LLM/TTS keys in mobile
- no secrets in git
- no `.env` committed
- provider config via env only
- budget limits via config/env
