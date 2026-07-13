# Decisions

This file records current MVP decisions. Change it through explicit product or architecture decisions, not incidental implementation work.

## Product

- Product name: Hey City.
- Project wrapper / historical name: Sunshine AI Guide.
- Initial guides: Dana and Artur.
- Session model: one session per walk or drive.
- Vehicle story duration: 30-45 seconds.

## Platform

- Mobile app: React Native / Expo.
- Map provider: Google Maps.
- Backend implementation folder: `server/` for Phase 0-1. Do not rename to `backend/` during this phase.

## Auth And Providers

- Auth: email OTP.
- LLM: OpenAI.
- STT: OpenAI.
- TTS: OpenAI first; ElevenLabs optional later.
- Audio storage: Cloudflare R2.

## Phase 0-1 Constraint

- Do not connect production Google, LLM, TTS, Redis, PostgreSQL, or object storage.
- Use local POI seed, deterministic mocks, pure functions, and replay tests first.

