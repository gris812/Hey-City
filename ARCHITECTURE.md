# Architecture

This is the short working architecture for Phase 0-1.

## Request Flow

Mobile sends auth, profile, session, and discovery requests to `server/`. The server owns orchestration, provider boundaries, decision logic, caching, safety constraints, and narration planning. Mobile renders the map, sends movement context, and plays or displays the resulting story state.

The Express app is built by `createApp()` and started by `src/index.ts`. Tests import `createApp()` directly so route behavior can be verified without opening a network port.

## Drive Discovery Flow

1. Mobile starts a walk or drive session.
2. Mobile sends periodic context pings: location, speed, heading, timestamp.
3. Server evaluates gates: GPS quality, mode/speed, muted/listening state, cooldown, anti-repeat, budget.
4. Server selects candidates from local seed during Phase 0-1.
5. Server returns a `DiscoveryDecision`.
6. If the decision triggers a story, the server creates a `NarrativePlan` and mock narration.

During Phase 0-1, `/drive/session/ping` and candidate endpoints use the NYC Financial District JSON seed. Google Places and Distance Matrix remain provider adapters for a later phase and are not required for tests.

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
- `POST /discovery/active-poi`
- `GET /pois/nearby`
- `POST /stories/generate`

## NarrativePlan Flow

`DiscoveryDecision` decides whether a story should happen. `NarrativePlan` describes what should be said, for whom, in what mode, and under which safety constraints. LLMs later turn a plan into prose; they do not choose POIs, timing, mode, or safety behavior.

## Provider Boundaries

- Google Maps/Places/Matrix: backend only, not used in Phase 0-1 tests.
- OpenAI LLM/STT and TTS: backend only, mocked in Phase 0-1.
- Cloudflare R2: backend only, not used in Phase 0-1.
- Redis/PostgreSQL: not used in Phase 0-1.

## Config Policy

All thresholds, intervals, durations, TTLs, speed limits, cooldowns, provider keys, and budgets must live in config/env. Product logic must not hardcode those values.
