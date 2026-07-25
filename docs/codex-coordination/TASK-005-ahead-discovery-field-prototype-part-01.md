# TASK-005 — Ahead Discovery Field Prototype

**Project:** Sunshine AI Guide / Hey City  
**Priority:** P0  
**Status:** Ready for implementation  
**Owner:** Codex  
**Scope:** Mobile + backend vertical prototype  

---

## 1. Objective

Implement a minimal field-testable **Ahead Discovery** prototype for the primary Exploring / Ambient Discovery flow.

The prototype must work during real vehicle movement anywhere in the United States without requiring a predefined or test route.

The system must:

1. read the user's real location, speed, and movement direction;
2. search for relevant cities, towns, regions, and significant non-commercial points of interest ahead of the user;
3. exclude irrelevant local commercial businesses and objects behind the user;
4. select and display the best upcoming discovery target;
5. expose enough diagnostic information to evaluate selection quality during field testing.

This task validates **target discovery and selection only**.

Do not implement storytelling quality, visual design polish, LLM narration, TTS, voice interaction, user personalization, or spatial cache in this task.

---

## 2. Product Scenario

During a real road trip, the application should identify meaningful targets ahead and produce a debug result equivalent to:

```text
Upcoming target: Springfield, Illinois
Distance: 5.2 miles
Heading deviation: 8°
Target type: city
Reason selected: relevant settlement ahead

Known nearby attractions:
- Lincoln Home National Historic Site
- Illinois State Capitol
- Dana-Thomas House
```

The first implementation may show structured debug data instead of user-facing narrative prose.

The prototype does not provide navigation or route guidance.

---

## 3. Confirmed Product Decisions

The following decisions are final for this task:

1. **Exploring / Ambient Discovery is the primary branch.**
2. The application must work without a predefined route.
3. Field testing uses real GPS movement.
4. Google Maps Platform is the primary provider for the prototype.
5. Google provider calls are made by the backend only.
6. Default provider refresh frequency is **once every 60 minutes**.
7. Provider refresh frequency must be manually configurable.
8. Local GPS evaluation and distance recalculation must occur more frequently than provider refresh.
9. The following targets must not be considered:
   - stores;
   - shopping locations;
   - gas stations;
   - restaurants, cafes, bars, and takeaway businesses;
   - local services;
   - small local businesses;
   - objects behind the user.
10. Spatial cache is explicitly deferred.
11. LLM, TTS, voice support, narrative generation, and production design are explicitly deferred.

---

## 4. Architectural Boundaries

Preserve existing project boundaries:

- Mobile collects location context and renders diagnostic state.
- Backend calls Google services, normalizes candidates, filters candidates, scores candidates, and selects the active target.
- Mobile must not call Google Places, Geocoding, Routes, LLM, or TTS directly.
- Provider-specific code must remain behind an adapter.
- Discovery and scoring logic must not depend directly on Google response structures.
- Configuration values must live in config/environment, not in selection code.
- The LLM must not participate in target selection.

Use the current repository structure. The backend directory may be named `server/`; do not mechanically rename it.

Before coding, inspect the repository and report:

1. current relevant files;
2. files that will be modified;
3. existing discovery/session code that can be reused;
4. any conflicts between current contracts and this task.

Do not perform broad refactoring.

---

## 5. Provider Strategy

### 5.1 Primary provider

Use **Google Maps Platform** through backend adapters.

Expected initial provider responsibilities:

| Data need | Initial Google service |
|---|---|
| Upcoming cities, towns, localities, regions | Geocoding and/or appropriate Google place search capability |
| Significant attractions around upcoming settlements | Places API (New) |
| Place metadata | Places API (New), with minimal field masks |
| Route validation | Not required in TASK-005 |

Codex must inspect the current provider implementation before deciding exact endpoints and files.

### 5.2 Required adapter boundary

Introduce or reuse a provider-neutral boundary similar to:

```ts
export interface DiscoveryDataProvider {
  searchAhead(input: SearchAheadInput): Promise<ProviderDiscoveryCandidate[]>;
}
```

The exact interface may differ to match current architecture, but it must satisfy these rules:

- no Google DTOs outside the adapter;
- normalized internal candidate type;
- explicit provider error handling;
- configurable limits and field masks;
- safe degraded response when Google is unavailable.

Do not name the business service `GooglePlacesService` if it also owns target selection. Google-specific code must be isolated from deterministic discovery logic.

---

## 6. Refresh and Evaluation Model

Provider refresh and position evaluation are separate processes.

### 6.1 Provider refresh

Default:

```yaml
AHEAD_DISCOVERY_PROVIDER_REFRESH_MINUTES: 60
```

Requirements:

- configurable through environment/config;
- manual setting supported in developer settings or existing configuration surface;
- minimum allowed value should be validated;
- do not silently accept invalid values;
- provider refresh must not happen on every GPS update;
- no spatial cache in this task.

Recommended validation range for the prototype:

```text
15–240 minutes
```

Use a different range only if current project configuration conventions strongly justify it. Document the reason in the implementation summary.

### 6.2 Local position evaluation

Default:

```yaml
AHEAD_DISCOVERY_EVALUATION_SECONDS: 20
```

Requirements:

- recalculate distance and relative bearing using the most recent device position;
- remove candidates that are now behind the user;
- preserve the current selected target when minor GPS or heading jitter occurs;
- do not call Google on each evaluation;
- this setting does not need to be user-configurable in TASK-005, but it must live in config.

### 6.3 Manual refresh

Provide a developer-only manual action to force a provider refresh.

This action must:

- clearly indicate loading, success, or failure;
- not bypass backend validation;
- not be presented as a production user feature.

---

