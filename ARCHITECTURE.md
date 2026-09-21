# Architecture

This is the short working architecture for Phase 0-1.

## Request Flow

Mobile sends auth, profile, session, and discovery requests to `server/`. The server owns orchestration, provider boundaries, decision logic, caching, safety constraints, and narration planning. Mobile renders the map, sends movement context, and plays or displays the resulting story state.

The Express app is built by `createApp()` and started by `src/index.ts`. Tests import `createApp()` directly so route behavior can be verified without opening a network port.

## Drive Discovery Flow

1. Mobile starts a walk or drive session.
2. Mobile sends periodic context pings: location, speed, heading, timestamp.
3. Server evaluates gates: GPS quality, mode/speed, muted/listening state, cooldown, anti-repeat, budget.
4. Server selects candidates through deterministic ahead-discovery and local fallback providers.
5. Server returns a `DiscoveryDecision`.
6. If the decision triggers a story, the server normalizes verified evidence, builds a server-only `StoryBrief`, creates the public `NarrativePlan`, and routes one `final_storytelling` call through `AITaskRouter` before TTS.

Discovery ranking, target selection, timing, safety and budgets remain deterministic. The language model receives the approved target and evidence; it cannot change those product decisions.

## API Surface

Current internal MVP endpoints remain stable:

- `POST /drive/session/start`
- `POST /drive/session/ping`
- `POST /drive/session/story/finish`
- `POST /drive/session/stop`
- `POST /drive/poi/candidates`
- `POST /narration/generate`

Canonical aliases are thin wrappers over the same implementation:

- `POST /sessions/start`
- `POST /sessions/:sessionId/context`
- `POST /sessions/:sessionId/story/end`
- `POST /sessions/:sessionId/end`
- `POST /sessions/:sessionId/select`
- `GET /sessions/:sessionId/objects/:poiId/availability`
- `POST /discovery/active-poi`
- `GET /pois/nearby`
- `POST /stories/generate`

## NarrativePlan Flow

`DiscoveryDecision` decides whether a story should happen. Normalized `EvidenceBundle` and `StoryBrief` remain server-internal because they can contain source prose and an earlier transcript. The shared `NarrativePlan` carries the authoritative target, level, moment, angle, beats, evidence identifiers and safety limits without raw evidence or continuation text. `GuidePolicy` is the canonical runtime storytelling behavior for Dana and Arthur. The LLM turns this fixed plan into prose; it does not choose POIs, timing, mode, evidence, or safety behavior.

A successful short story stores minimal session-owned continuation state. A detailed request for the same POI, canonical guide ID and language receives the previous transcript as already-heard context. A POI, guide or language change, superseding selection, or session end invalidates that context.

## Provider Boundaries

- Google Maps/Places/Matrix: backend only; tests use deterministic provider doubles.
- OpenAI LLM and TTS: backend only, behind `GenerativeProvider` and the narration service. M1 permits one `final_storytelling` call per uncached segment and performs planning and output QA deterministically.
- Cloudflare R2: backend only, not used in Phase 0-1.
- Redis/PostgreSQL: production persistence/cache boundaries retain local fallbacks for isolated tests.

## Config Policy

All thresholds, intervals, durations, TTLs, speed limits, cooldowns, provider keys, and budgets must live in config/env. Product logic must not hardcode those values.
