# 01 — System Overview

## Purpose

This document explains the top-level architecture of Hey City.

Hey City is a mobile-first, voice-first AI city guide. The product detects user movement, understands nearby or upcoming points of interest, selects the right story, generates a guide-specific narration, and delivers safe audio to the user.

## Core rule

The LLM does not decide what to say, when to say it, or why.

The backend brain and deterministic services decide:
- active context
- POI selection
- timing
- story type
- story duration
- safety constraints
- guide/persona

The LLM only formulates text from a `NarrativePlan`.

## Diagram

```mermaid
flowchart TD
    U[User] --> M[Mobile App]

    M -->|location, speed, heading, mode| API[Backend API]

    API --> C[Context Service]
    API --> DS[Discovery Service]
    API --> SM[Session Manager]
    API --> NP[Narrative Planner]
    API --> SG[Story Generation Service]
    API --> DL[Delivery Service]

    C --> Brain[AI Guide Brain]
    DS --> Brain
    SM --> Brain
    NP --> Brain

    DS --> GP[Google Places / Maps APIs]
    Brain --> KG[Internal Knowledge Graph]
    Brain --> SP[Story / POI Seed Data]

    NP --> Plan[NarrativePlan]
    Plan --> SG
    SG --> LLM[OpenAI LLM]
    SG --> TTS[TTS Provider]
    TTS --> OS[Object Storage / Audio Cache]
    OS --> M

    API --> Cache[Redis / Upstash Cache]
    API --> DB[(PostgreSQL)]

    M -->|play audio| U
```

## Block responsibilities

| Block | Responsibility |
|---|---|
| Mobile App | Map UI, location tracking, mode selection, audio playback, user interaction |
| Backend API | Validates requests, exposes product endpoints, coordinates services |
| Context Service | Normalizes raw GPS, speed, heading, app state, and mode |
| Discovery Service | Finds candidate POIs and evaluates whether a story should trigger |
| Session Manager | Tracks walk/drive session state, cooldowns, active narration, history |
| AI Guide Brain | Orchestrates context, story selection, safety, persona, and planning |
| Narrative Planner | Produces structured `NarrativePlan`; no prose generation |
| Story Generation Service | Converts `NarrativePlan` into guide-specific narration |
| Delivery Service | Handles TTS, audio caching, playback metadata |
| Knowledge Graph | Internal enriched city data: POIs, stories, themes, facts, relationships |
| Redis / Upstash | Cache for POI lookups, ETA, story text, TTS audio metadata, rate limits |
| PostgreSQL | Persistent users, sessions, POIs, saved places, history, story nodes |
| Object Storage | Cached generated audio and media assets |
| Google APIs | Places discovery, directions, distance/ETA; backend only |
| OpenAI | LLM, STT, initial TTS option |
| ElevenLabs | Optional/premium TTS voice layer |

## MVP implementation stance

For early MVP:
- local NYC Financial District POI seed is allowed
- Walking and Drive pass the deterministic `NarrativePlan` to the shared Narrative Generation boundary
- OpenAI is the active production provider for final storytelling; deterministic mock narration is a test/outage fallback
- `AITaskRouter` chooses a configured provider by task class; it never receives authority over POI, timing, ranking, safety, or budget policy
- auxiliary AI tasks remain deterministic until a small-model benchmark is explicitly accepted
- production providers should not be required for deterministic tests
- all thresholds and provider limits must live in config/env
