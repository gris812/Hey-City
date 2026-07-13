# AGENTS.md

## Project
Sunshine AI Guide

Mobile-first AI city guide with:
- map-first exploration
- walking and driving modes
- Drive Discovery Engine
- AI Guide Brain
- short adaptive narration
- saved places
- future AI tours and creator features

## Mission
Build the MVP in a reliable, deterministic way.
The goal is not to build the full platform at once.
The goal is to prove the core experience:
the user moves through the city and the city starts telling its story.

## Canonical rules
1. Follow the docs in `/docs/context` first.
2. Prefer the smallest working MVP slice.
3. Do not invent architecture that conflicts with canonical docs.
4. Brain/services make decisions.
5. LLM only generates or rewrites text from structured inputs.
6. Vehicle mode is audio-first and safety-constrained.
7. Keep the system deterministic where possible.
8. All thresholds, timing, and limits must be config-driven.
9. Do not hardcode secrets or API keys.
10. Keep controllers thin and move logic into services.

## Canonical documents
Always treat these as primary sources:
- `/docs/context/AI_Guide_Brain_Unified_Architecture_v2_Canonical.md`
- `/docs/context/Product_Architecture_v1.md`
- `/docs/context/Hey_City_MVP_API_Specification_v1.md`
- `/docs/context/Hey_City_Story_Engine_Logic.md`
- `/docs/context/План_разработки_Sunshine_AI_Guide.md`

Use these as secondary references:
- `/docs/reference/Platform_Master_Blueprint_v1.md`
- `/docs/reference/City_Knowledge_Graph_Technical_Specification_v1.md`
- `/docs/reference/MVP_City_Dataset_Pack_v2.md`
- `/docs/reference/Product_Experience_Map_v1.md`

## Architecture principles
- Separate repo for Sunshine AI Guide.
- Main folders: `mobile/`, `server/` (backend implementation), optional `shared/`.
- Mobile uses Maps SDK only.
- Google Places / Distance Matrix / Directions are backend-only.
- Backend is the orchestration layer for Drive Discovery.
- Story triggering must follow explicit state logic.
- Story continuation must not break on temporary heading changes.

## MVP priorities
Priority order:
1. session + auth basics
2. Drive Discovery state logic
3. nearby POI selection
4. trigger decision and cooldown
5. narration pipeline
6. mobile ping loop + audio playback
7. saved places / history basics

## Coding rules
- TypeScript preferred end-to-end.
- Use explicit interfaces and DTOs.
- Keep modules small and testable.
- No magic numbers in business logic.
- Prefer pure functions for scoring and selection.
- Add comments only where logic is non-obvious.
- Avoid speculative abstractions.
- Before implementing a feature, inspect existing libraries, framework capabilities, and local project utilities that may already solve the problem.
- Prefer proven existing solutions when they meet the product, safety, maintainability, and performance requirements. Write custom code only when it is clearly simpler, more reliable, or better suited to the project's constraints.
- Structure and document code so another developer can understand the purpose, boundaries, inputs, outputs, and key decisions without asking the founder or the original implementer.
- If no standard or local solution fits the problem, involve a TRIZ Advisor subagent before designing a custom approach.

## Agent workflow
Before coding:
1. read relevant canonical docs
2. check existing solutions in the codebase, dependencies, platform APIs, and common libraries
3. if no suitable solution exists, consult a TRIZ Advisor subagent for contradiction analysis and simplification options
4. produce a short implementation plan
5. list files to change
6. state assumptions
7. then implement only the approved slice

After coding:
1. summarize changed files
2. list open issues / TODOs
3. list assumptions and risks
4. confirm whether implementation matches canonical rules

## Roles
### Orchestrator
Plans slices, checks cross-file consistency, prevents architecture drift.

### Backend Agent
Owns:
- sessions
- Drive Discovery
- POI selection
- ETA logic
- caching
- API contracts

### Mobile Agent
Owns:
- map screen
- location tracking
- ping loop
- playback
- minimal driving UI

### AI/Infra Agent
Owns:
- NarrativePlan schema
- prompt templates
- guide persona conditioning
- TTS/LLM integration
- story compression rules

### Product/Content Agent
Owns:
- POI seeds
- themes
- story seeds
- guide QA
- narrative validation

## Safety
In vehicle mode:
- audio first
- minimal visual load
- short narration segments
- no rapid guide switching
- no distracting UI overload

## What not to do
- Do not let the LLM choose POIs by itself.
- Do not mix old conflicting architectures into new code.
- Do not implement large post-MVP systems unless requested.
- Do not expand scope silently.
