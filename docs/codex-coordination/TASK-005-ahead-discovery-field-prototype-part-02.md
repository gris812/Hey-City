## 7. Movement Context

Reuse existing context contracts where practical. Extend them only when required.

Minimum normalized movement data:

```ts
export type MovementContext = {
  latitude: number;
  longitude: number;
  headingDegrees: number | null;
  speedMps: number | null;
  accuracyMeters: number;
  timestamp: string;
};
```

Requirements:

- validate latitude and longitude;
- reject or hold on stale GPS;
- surface poor accuracy in diagnostics;
- handle missing native heading;
- when possible, derive a fallback heading from consecutive valid location points;
- do not let a single noisy heading update replace a stable target immediately.

Do not build a complex sensor-fusion subsystem in this task.

---

## 8. Ahead Search Geometry

Do not use only a circular nearby search centered on the current location.

Create a simple forward-looking search model based on:

- current position;
- stable heading;
- speed band;
- projected point or sequence of projected points ahead;
- configurable distance and heading tolerance.

The implementation may use one of these minimal approaches:

### Option A — Projected search points

Generate several points ahead of the user and perform provider searches around those points.

### Option B — Broad provider search + deterministic corridor filter

Retrieve candidates from a broad area, then retain only candidates inside the computed forward corridor.

Choose the simplest approach compatible with current Google APIs and project code.

The deterministic layer must calculate at least:

```ts
export type CandidateGeometry = {
  distanceMeters: number;
  bearingDegrees: number;
  headingDeltaDegrees: number;
  isAhead: boolean;
};
```

A target is behind the user when its angular relation to the stable movement heading exceeds the configured ahead tolerance.

All thresholds must be configurable.

Suggested starting configuration:

```yaml
AHEAD_DISCOVERY_MAX_HEADING_DELTA_DEGREES: 70
AHEAD_DISCOVERY_TARGET_DISTANCE_MIN_M: 500
AHEAD_DISCOVERY_TARGET_DISTANCE_MAX_M: 25000
```

These are prototype defaults, not permanent product constants.

---

## 9. Candidate Model

Reuse the canonical `DiscoveryTarget` terminology.

The prototype must support at least these target classes:

```ts
export type AheadDiscoveryTargetType =
  | "city"
  | "town"
  | "locality"
  | "region"
  | "historical_landmark"
  | "cultural_landmark"
  | "monument"
  | "museum"
  | "national_park"
  | "state_park"
  | "park"
  | "natural_feature"
  | "bridge"
  | "visitor_center"
  | "university"
  | "other_significant_place";
```

Do not redesign the entire canonical target taxonomy in this task.

If the current shared `DiscoveryTargetType` does not support these values, choose one minimal approach:

1. extend the shared type carefully; or
2. introduce a prototype-normalization subtype and map it into the current target contract.

Explain the selected approach in the completion report.

Minimum normalized candidate:

```ts
export type DiscoveryCandidate = {
  providerId: string;
  provider: "google";
  name: string;
  targetType: AheadDiscoveryTargetType;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  bearingDegrees: number;
  headingDeltaDegrees: number;
  isAhead: boolean;
  rating?: number;
  userRatingCount?: number;
  providerTypes: string[];
  importanceScore?: number;
};
```

Do not require all optional Google metadata.

Use minimal Google field masks to control cost.

---

## 10. Filtering Rules

### 10.1 Strategy

Use an **allow-list first** strategy.

A deny-list may be used as secondary protection, but deny-list-only filtering is not sufficient.

### 10.2 Explicitly excluded target groups

Exclude candidates classified as:

- store or retailer;
- shopping mall or shopping center;
- gas station;
- restaurant;
- cafe;
- bar;
- takeaway or meal delivery business;
- lodging unless later explicitly approved;
- supermarket;
- convenience store;
- car dealer;
- car repair;
- local service;
- routine small commercial business;
- candidate behind the user.

### 10.3 Initial allow-list intent

Include normalized targets representing:

- cities and towns;
- meaningful localities and regions;
- historical and cultural landmarks;
- monuments;
- museums;
- national and state parks;
- significant natural features;
- major bridges;
- visitor centers;
- notable universities;
- other clearly significant non-commercial places.

Google type names must remain inside the provider adapter or type-normalization module.

### 10.4 Ambiguous candidates

If a candidate cannot be classified confidently:

- do not silently treat it as eligible;
- mark it as excluded or low-confidence in diagnostics;
- retain provider types and exclusion reason for QA.

---

## 11. Selection and Scoring

Implement deterministic scoring only.

The first version should consider:

1. ahead/heading compatibility;
2. distance suitability;
3. target type weight;
4. settlement relevance;
5. provider popularity signals where available;
6. anti-jitter stability bonus for retaining the current target.

Suggested conceptual model:

```text
score =
  aheadScore
  + distanceScore
  + categoryWeight
  + popularityWeight
  + currentTargetStabilityBonus
```

Do not let Google rating dominate selection.

A highly reviewed restaurant must never outrank an allowed historical landmark because commercial categories are excluded before scoring.

Suggested initial category priority:

1. upcoming city/town/locality;
2. national park or major natural feature;
3. historical/cultural landmark;
4. state park or major bridge;
5. monument or visitor center;
6. museum or notable university;
7. general park;
8. other significant place.

All numeric weights must live in config.

The selected result must include machine-readable reasons.

```ts
export type AheadDiscoveryDecision =
  | {
      type: "target_selected";
      target: DiscoveryCandidate;
      score: number;
      reasons: string[];
      refreshedAt: string;
      nextProviderRefreshAt: string;
    }
  | {
      type: "hold";
      reason:
        | "bad_gps"
        | "stale_gps"
        | "missing_heading"
        | "provider_unavailable"
        | "no_candidates"
        | "no_candidate_ahead"
        | "all_candidates_filtered"
        | "refresh_not_due";
    };
```

Adapt to current project DTO conventions rather than duplicating an existing union unnecessarily.

---

