# Field discovery and guide administration

Implementation decision, 2026-09-13. This note supersedes older fixed-corridor and hard-coded two-guide descriptions for the WebApp/API runtime.

## Prototype comparison

The authenticated source of `hey-city-explore.sunshineintelligence.chatgpt.site` was inspected read-only (`worker/discoveryProfileConfig.ts`, `worker/discovery.ts`, `worker/narrative.ts`). It is a separate implementation, not merely another stylesheet for this server. Its urban search is centred closer to the user and ranks by distance. Its Wikipedia lookup uses search, whereas the server previously required an exact title. Its narrative boundary also supports Google facts; that enrichment has not been copied wholesale because it adds paid fields and requires source-quality controls.

A bounded production probe at 38.627,-90.1994 with heading north and speed 40 km/h returned 12 candidates, excluded 10 by heading, and produced a sourced St Louis city story with an audio URL. This confirms neither universal failure nor successful device playback: the restrictive filter and location-specific coverage need separate validation.

## Deterministic discovery

`discoverySearchProfile` selects configured search geometry from measured speed:

| Profile | Speed | Radius | Projection | Heading limit | Google ranking |
| --- | --- | --- | --- | --- | --- |
| Walking | below 10 km/h | 3 km | none | no gate | distance |
| Urban drive | below 17.88 m/s | 6 km | 1.5 km | 110° | distance |
| Highway | otherwise | 14 km | 8 km | 75° | popularity |

The existing mode controller remains responsible for the displayed walking/vehicle mode. Search profile thresholds do not change product mode. Missing headings search around the user. Nearby entrances and current-city context remain eligible. Scoring cannot assign negative heading scores; walking heading does not penalize a candidate.

`nearbyCandidates` is the distance-sorted display pool; `topCandidates` remains the narrative eligibility pool. A visible marker is not a promise of a story. Business logic owns discovery, filtering, timing, NarrativePlan and budget routing; guide personality affects wording only.

Independent Places and reverse-geocoding caches preserve partial successes. Area lookup cache is shared by geographic cell for one hour; Places cache is 15 minutes. Identical in-flight requests coalesce. Empty results count as completed refreshes. Provider/key errors back off for five minutes. Cache identity includes search profile. Existing movement/time refresh limits stay in force.

Knowledge tries the title then bounded nearby Wikipedia pages with name/coordinate checks. It rotates through the eligible pool rather than retrying the same first candidates indefinitely. No-match is distinct from provider error and is cached. This can still reject places with no sufficiently matched source. The prototype's broader enrichment is not full parity; do not describe every empty result as an API outage.

## Admin and persistent catalogue

Access requires a verified admin role AND normalized email `slepak@stolbergco.com`. Existing ADMIN_AUTH_CODE remains the credential. A forged role with another email is rejected.

`guides` stores validated JSON documents with localized display copy, image/avatar paths, ordering, published status, personality and OpenAI voice settings. Seeds are inserted once, never overwriting edits. `/guides` returns published presentation data. `/admin/guides` supports editing and archiving; archiving preserves historical IDs and the last published guide cannot be removed. Guide changes invalidate narration/voice cache keys through a document version hash. The WebApp iterates over all published guides.

Admin image preparation uses browser canvas for main-photo resizing and square avatar framing. Uploaded PNG/JPEG files live in the existing persistent media volume. Public URLs cannot be arbitrary remote URLs. Circular avatar presentation has a white background. Back up both PostgreSQL and the media volume together.

## Account analytics

Authenticated 30-second heartbeats measure visible-app or playing-audio time. Server time determines intervals; gaps over 75 seconds are discarded. User-row locking prevents concurrent tabs double counting. UTC-midnight intervals are split. Active guide and audio guide can differ during an existing story. Selected guide, time per guide and most-used guide are shown per account.

Request context attributes provider usage to the initiating authenticated account. Shared cache hits have no provider charge. Costs are estimates by category/model, not invoices; legacy unassigned events remain explicitly unassigned. Data before heartbeat deployment cannot be reconstructed. Retention follows the existing usage retention configuration.

Routes: GET `/admin/accounts?days=30`; POST `/usage/activity`; GET/PUT `/admin/guides/:id` (listing at `/admin/guides`); DELETE archives; POST `/admin/guide-image`; PUT `/sessions/:id/guide` updates the session choice.

## Client lifecycle and limitations

The persistent map is retained across tabs. Course-up uses vector-map heading and the compass toggles north-up. Raster fallback cannot rotate and reports that limitation. Units persist locally and convert presentation only. GPS marker updates independently of the five-second API throttle. Nearby places replace the idle guide message; a playing/ready story keeps its controls.

Validation covers PostgreSQL-compatible migrations and transactions using PGlite, HTTP admin authorization, catalogue lifecycle, usage attribution, concurrent heartbeat handling, search geometry, provider partial failures, and WebApp navigation/catalogue/units/compass. Device GPS, iOS background execution and actual audio playback still require an on-device check after deployment. Docker-image builds belong to GitHub Actions because Docker is unavailable in the editing environment.

## Manual exploration update

Audio follow-up (2026-09-14): the player is primed inside the Start/select/voice-sample user gesture, with one short clip (not a background keep-alive). Load failures show a retry action. The bounded Wikipedia shortlist starts concurrently but is consumed in deterministic priority order. Identical TTS work coalesces and completed MP3s are published by atomic rename.

### Progressive speech delivery

Walking, Drive and manual selection now return the existing `audioUrl` after the first nonempty TTS chunk, without waiting for the complete MP3. The existing HTMLAudioElement consumes `/media/:hash.mp3` progressively. OpenAI's binary Speech response already supports streaming; no extra LLM, introductory filler, sentence splitting or extra paid speech request is introduced. Voice samples retain the full-file response path for compatibility. Discovery, ranking, facts, NarrativePlan and timing are unchanged.

During generation the media middleware replays the buffered prefix and pipes subsequent bytes with backpressure. `X-Accel-Buffering: no` disables standard Nginx response buffering; an outer CDN must also allow streaming. Active responses are `no-store`, with unknown length (Range may be ignored with HTTP 200). After atomic completion, the same URL is a persistent static MP3 with normal byte-range support. Unknown GETs cannot generate paid speech. Concurrent requests share one job, including reconnects. Errors never publish a partial MP3; they return 502 before headers or break the stream after headers. The client exposes retry instead of silently marking the story complete.

Resource controls: `PROGRESSIVE_SPEECH=false` restores full-file waiting; `SPEECH_TIMEOUT_MS=45000`, `MAX_SPEECH_JOBS=8`, `MAX_SPEECH_BYTES=8388608`, `SPEECH_FAILURE_RETENTION_MS=30000`. Failed jobs back off within that retention period. The registry is single-process, matching the current one-API-container deployment. It requires a shared broker or sticky routing before multiple replicas. Completed cache files survive restarts; active streams do not. Selecting another object or ending a session detaches the old browser stream. An already-paid upstream request finishes into the cache, rather than being cancelled and paid for again on reconnect; no further chunks/tasks are scheduled separately.

Tests gate the upstream completion and prove HTTP first bytes arrive while it is still open, verify single-flight, disconnected readers, cache/ranges, CORS, and no partial file on failure. `speech_first_byte` and `speech_complete` logs measure provider latency separately. These are not device audible-start measurements. Source lookup and full LLM text generation still precede speech: this removes the full-MP3 wait but does not guarantee sub-second total latency or fix an overly late Discovery trigger. iPhone/Safari buffering and production proxy behavior require field verification.

Dragging the map disables automatic centring until the compass is pressed. Follow mode offsets the user marker into the unobscured map area; the results sheet is height-limited and collapsible. GPS updates continue without snapping a manually moved map back.

POST `/sessions/:sessionId/select` accepts only a provider ID already discovered for the caller's session. Explicit selection bypasses the automatic heading/timing choice, but not source validation: insufficient evidence returns 422 rather than invented narration. One manual generation per session can run at a time. The existing narrative provider, guide choice, usage accounting and TTS cache are reused. Server session loss restores the Start control and explains that a new session is required; sessions are still held in process memory and do not survive an API restart.
