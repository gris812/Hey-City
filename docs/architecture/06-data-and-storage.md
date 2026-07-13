# 06 — Data and Storage

## Purpose

This document separates volatile discovery data from persistent city knowledge, session history, and generated media.

## Diagram

```mermaid
flowchart TD
    GP[Google Places / Maps] -->|external POI discovery| DS[Discovery Service]
    Seed[Local NYC POI Seed] --> DS

    DS --> KG[Internal Knowledge Graph]

    KG --> DB[(PostgreSQL)]
    Sessions[Session State] --> DB
    Saved[Saved Places / History] --> DB

    DS --> Cache[Redis / Upstash]
    ETA[ETA Results] --> Cache
    POICache[Nearby POI Cache] --> Cache
    TextCache[Generated Story Text Cache] --> Cache
    AudioMeta[Audio Metadata Cache] --> Cache

    TTS[TTS Provider] --> R2[Cloudflare R2 / Object Storage]
    R2 --> CDN[CDN / Public Audio URL]
    CDN --> Mobile[Mobile App]
```

## Storage roles

| Storage | Role |
|---|---|
| Local JSON seed | Development fallback and deterministic tests |
| Google Places | External discovery source |
| PostgreSQL | Persistent product data |
| Redis / Upstash | Cache and rate limits |
| Cloudflare R2 | Generated audio files and media |
| Mobile local storage | Auth token, settings, cached light state |

## PostgreSQL MVP entities

Recommended later-stage MVP tables:
- users
- user_profiles
- sessions
- session_events
- pois
- poi_facts
- story_nodes
- narrative_plans
- generated_stories
- saved_places
- guide_profiles
- tours
- tour_stops

Do not introduce all tables before deterministic core is stable.

## Local POI seed

A local seed should exist for NYC Financial District.

Purpose:
- test without Google API
- avoid cost during development
- support route replay tests
- enable deterministic demo

Recommended fields:
- id
- name
- lat
- lng
- category
- role
- themes
- narrativeWeight
- factualAnchors
- shortDescription
- source
