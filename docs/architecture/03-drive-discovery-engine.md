# 03 — Drive Discovery Engine

## Purpose

Drive Discovery is the core product engine.

It decides whether the user is near or approaching a meaningful point of interest, and whether the app should trigger a story.

This must be deterministic and testable before LLM, TTS, Google production APIs, or UI polish are added.

## High-level flow

```mermaid
flowchart TD
    A[Session Ping] --> B[Normalize ContextSnapshot]
    B --> C{Valid GPS?}
    C -->|No| X1[Hold: bad_gps]

    C -->|Yes| D[Detect mode and speed band]
    D --> E{Allowed by mode/speed?}
    E -->|No| X2[Hold: speed_too_low or invalid_mode]

    E -->|Yes| F{App muted/background/listening?}
    F -->|Blocked| X3[Hold: muted/background/listening]

    F -->|Allowed| G[Load candidate POIs]
    G --> H[Score candidates]
    H --> I[Estimate ETA/distance]
    I --> J[Apply cooldown]
    J --> K[Apply anti-repeat]
    K --> L[Apply budget/rate guardrails]
    L --> M{Trigger conditions met?}

    M -->|No| X4[Hold with reason]
    M -->|Yes| N[DiscoveryDecision: trigger_story]
    N --> O[Build NarrativePlanInput]
```

## Core inputs

| Input | Description |
|---|---|
| latitude / longitude | User position |
| speed | Real speed from device when available |
| heading | Direction of movement |
| mode | walking, vehicle, explore |
| session state | active story, cooldown, previous POIs |
| app state | foreground, background, muted, listening |
| preferences | guide, themes, language |
| provider budget | quota and cost guardrails |

## Core outputs

The Discovery Engine should return a `DiscoveryDecision`.

```ts
type DiscoveryDecision =
  | {
      type: "trigger_story";
      poiId: string;
      triggerReason: "eta" | "distance" | "manual";
      etaSeconds?: number;
      distanceMeters: number;
      mode: "walking" | "vehicle" | "explore";
      narrativePlanInput: NarrativePlanInput;
    }
  | {
      type: "hold";
      reason:
        | "bad_gps"
        | "speed_too_low"
        | "invalid_mode"
        | "muted"
        | "backgrounded"
        | "already_listening"
        | "cooldown_active"
        | "anti_repeat"
        | "no_candidate"
        | "budget_guardrail"
        | "eta_too_soon"
        | "eta_too_late";
    };
```

## Candidate scoring

```mermaid
flowchart LR
    A[Candidate POI] --> B[Distance score]
    A --> C[Heading / ahead score]
    A --> D[Popularity / rating score]
    A --> E[Theme relevance]
    A --> F[Narrative weight]
    A --> G[Anti-repeat penalty]
    A --> H[Mode compatibility]

    B --> Z[Final POI score]
    C --> Z
    D --> Z
    E --> Z
    F --> Z
    G --> Z
    H --> Z
```

## Config values

All values must live in config/env, not hardcoded.

Examples:
- `PING_INTERVAL_SECONDS`
- `VEHICLE_MIN_SPEED_KMH`
- `WALKING_MAX_SPEED_KMH`
- `VEHICLE_STORY_MIN_SECONDS`
- `VEHICLE_STORY_MAX_SECONDS`
- `DISCOVERY_COOLDOWN_SECONDS`
- `ANTI_REPEAT_HOURS`
- `GPS_STALE_SECONDS`
- `HEADING_GRACE_SECONDS`
- `NEARBY_CACHE_TTL_SECONDS`
- `ETA_CACHE_TTL_SECONDS`
- `TOP_K_ETA_CANDIDATES`
- `GOOGLE_DAILY_BUDGET_LIMIT`

## Test priorities

Must be covered with pure unit or replay tests:
- speed/mode gating
- distance and heading checks
- ETA trigger logic
- cooldown
- anti-repeat
- bad GPS handling
- active story survival through GPS jitter
- fallback distance trigger
- cache key behavior
- budget guardrail behavior
