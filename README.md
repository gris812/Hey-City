# Hey City (other name Sunshine AI Guide)

Hey City is a mobile-first AI city guide focused on map-based exploration, adaptive narration, and movement-aware storytelling.

## Core MVP Promise

A user opens the app, moves through the city, and the city begins to tell its story.

---

## MVP Scope

- map-first exploration
- nearby POI discovery
- walking mode
- driving mode
- Drive Discovery Engine
- AI guide narration
- saved places
- basic history/privacy controls

---

## Core Principles

- mobile-first product
- deterministic backend orchestration
- Brain/services decide
- LLM only formulates story text from structured inputs
- vehicle mode is audio-first and safety-constrained
- keep MVP simple and reliable

---

## Repository Structure

- `mobile/` — React Native / Expo client  
- `server/` — Node.js + TypeScript + Express backend implementation  
- `shared/` — optional shared DTOs / contracts  
- `docs/context/` — canonical product and architecture docs  
- `docs/reference/` — secondary reference docs  
- `cursor/prompts/` — reusable Cursor prompts  
- `data/guides/` — guide persona profiles  
- `cursor/rules/` — Cursor project rules  

---

## Canonical Engineering Docs

Always use these first:

- `docs/architecture/README.md`
- `docs/context/AI_Guide_Brain_Unified_Architecture_v2_Canonical.md`
- `docs/context/Product_Architecture_v1.md`
- `docs/context/Hey_City_MVP_API_Specification_v1.md`
- `docs/context/Hey_City_Story_Engine_Logic.md`
- `docs/context/План_разработки_Sunshine_AI_Guide.md`

---

## Architecture Summary

- Mobile sends location + session context to backend
- Backend performs:
  - POI discovery
  - scoring and selection
  - ETA calculation
  - trigger decision
  - narration orchestration
- Mobile uses Maps SDK only
- Google Places / Distance Matrix / Directions are backend-only

### Core Engine

Drive Discovery Engine:
- evaluates context continuously
- selects POI candidates
- triggers stories based on ETA and rules
- enforces cooldown and pacing
- ensures safe vehicle-mode behavior

---

## Tech Stack

### Backend
- Node.js
- TypeScript
- Express
- Redis (optional, caching)
- PostgreSQL (structured data)
- Object storage (audio)

### Mobile
- React Native
- Expo
- Google Maps SDK
- audio playback
- location tracking

---

## Development Workflow

Plan first, then code.

### Standard workflow

1. read canonical docs in `docs/context/`
2. create implementation plan
3. list files to modify
4. define assumptions
5. implement smallest working slice
6. summarize changes + open issues

### Important rules

- do not skip planning
- do not implement large features at once
- always validate against canonical docs
- do not let LLM make product decisions

---

## MVP Priorities

1. session + auth basics  
2. Drive Discovery Engine state logic  
3. POI candidate selection  
4. trigger + cooldown logic  
5. narration pipeline  
6. mobile ping loop + playback  
7. saved places / history  

---

## Environment

### Backend

Create `server/.env`:

GOOGLE_MAPS_API_KEY=
JWT_SECRET=
OPENAI_API_KEY=


### Mobile

Create `mobile/.env`:

EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=


Do not commit `.env`.

---

## Running the Project

### Deterministic Drive Replay

```bash
npm run replay:drive
```

Runs the local Federal Hall route fixture through the in-memory Drive Discovery session loop. No Google, LLM, TTS, PostgreSQL, Redis, or object storage is required.

### Backend

```bash
cd server
npm install
npm run dev

### Mobile

```bash
cd mobile
npm install
npx expo start

### For native Google Maps:

```bash
npx expo prebuild
npx expo run:ios
or
npx expo run:android
