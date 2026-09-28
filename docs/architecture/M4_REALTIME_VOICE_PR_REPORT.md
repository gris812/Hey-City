# M4 Realtime Voice — PR report

## Scope and authority

M4 is an optional realtime audio transport over the existing M3
`ConversationService`. Only a final normalized user turn enters M3. Intent,
tools, JourneyRecall/StoryEvidence grounding, map/navigation actions and the
resume/abandon decision remain M3-owned. Discovery ranking/selection and
JourneyState ownership are unchanged.

One lazily-created `RealtimeVoiceSession` belongs to one `DriveSession`.
Starting a normal drive session opens no realtime connection and records no
realtime usage.

## Provider and credential boundary

- `SpeechProvider` wraps the existing quality TTS path and is used only for
  normal M3 TTS or fallback rendering of an already-grounded answer.
- `RealtimeConversationProvider` has OpenAI Realtime, Gemini Live and
  deterministic adapters behind a configurable router.
- OpenAI uses the server-mediated WebRTC SDP exchange. Its durable API key
  stays server-side.
- Gemini uses a backend-minted, single-use, short-lived constrained token. Its
  durable API key stays server-side.
- Provider sessions receive grounded M3 answer text plus rendering/persona
  instructions. They receive no authority to select tools, places,
  navigation, memory or story resume behavior.

References:

- OpenAI Realtime WebRTC/API reference: https://platform.openai.com/docs/api-reference/realtime-calls
- OpenAI Realtime client events: https://platform.openai.com/docs/api-reference/realtime-client-events
- Gemini Live ephemeral tokens: https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
- Gemini Live WebSocket API: https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket

## Runtime behavior

- explicit activation pauses the original local story before network setup;
- connection failure leaves the same story moment/audio resumable;
- partial transcripts stay transport-local;
- final turns use the canonical M3 service with normal TTS disabled only for
  that realtime turn;
- approved answer commands cross the authenticated session API back to the
  client-owned provider transport;
- provider output failure requests SpeechProvider fallback for the stored
  grounded answer and does not rerun intent, tools or M3 generation;
- barge-in stops local output first, increments generation, cancels provider
  output and rejects stale chunks/actions/resume;
- inactivity, maximum duration, guide/language changes and DriveSession end
  close provider work;
- active-session concurrency and bounded audio usage limits are configured;
- only bounded usage/cost counters and lifecycle metadata are persisted. Raw
  audio, transcripts, answers, precise GPS, secrets and provider payloads are
  excluded.

### Architecture/Product review follow-up: activation failure recovery

Realtime activation now fails closed. A bootstrap, transport-connect or
microphone-permission failure invalidates the failed generation and event
subscription before cleanup, closes local and server session resources,
briefly exposes the diagnostic state, and ends in recoverable `closed`. If M3
already suspended a story, the existing `onClosed` playback path resumes that
same original moment. A later Talk creates a clean bootstrap and exactly one
new interruption; stale failed-generation events cannot change state, resume
twice or create a Journey completion.

Focused mobile regressions cover bootstrap failure, transport-connect failure,
microphone permission denial, resource cleanup, same-moment resume, clean
retry, interruption/completion cardinality and stale callbacks.

## Client path

Mobile has a provider-neutral lifecycle and an OpenAI WebRTC adapter with a
minimal explicit Talk/End voice surface. `react-native-webrtc` requires an Expo
development/native build; Expo Go is intentionally not treated as a supported
M4 transport. Native build instructions and microphone permissions are in
`mobile/REALTIME_VOICE.md`, `mobile/eas.json` and `mobile/app.config.js`.
The adapter reports first-audio latency from the first provider audio delta,
alongside bounded provider usage counters.

Gemini's constrained WebSocket bootstrap and command codec are implemented on
the server/provider boundary. Its native bidirectional PCM transport remains a
live-benchmark integration-complexity item; it is not replaced by a fake Expo
Go workaround.

## Deterministic acceptance

| Acceptance | Result | Evidence |
|---|---|---|
| T1–T5 idle/owner/credential/activation/failure | PASS | provider, session, route and mobile lifecycle tests |
| T6–T12 M3 bridge/grounding/coffee/resume/stop | PASS | realtime session integration + M3 replay |
| T13–T18 barge/latest/timeout/reopen/config/end | PASS | realtime session, route and mobile tests |
| T19 privacy | PASS | telemetry allow-list regression |
| T20 cost accounting | PASS | bounded authenticated usage + provider pricing regression |
| T21 provider substitution | PASS | OpenAI, Gemini and deterministic contract tests |
| T22 M1/M2/M3/Discovery regressions | PASS locally | full server suite |
| R1–R5 | PASS | deterministic/provider-mocked replay |
| R6 deterministic comparison | PASS | identical B1–B6 definitions, 12 observations, explicitly labeled mocked |

`expo-doctor` passes 17/18 checks. The remaining diagnostic is recorded, not
suppressed: React Native Directory currently marks `react-native-webrtc` as
untested on the New Architecture. M4 therefore requires the documented
development/native build validation before release.

Commands:

```sh
npm run typecheck
npm run test:m1 --workspace server
npm run test:m2 --workspace server
npm run test:m3 --workspace server
npm run test:m4 --workspace server
npm test --workspace server
npm run test:presentation --workspace mobile
npm run test:web
npm run replay:m4
```

## Live B1–B6 benchmark gate

Status: **BLOCKED — not executed in this workspace**.

The same B1–B6 harness is present and rejects a comparison unless both
`openai_realtime` and `gemini_live` drivers return every script under one
recorded environment. The current workspace has no `OPENAI_API_KEY`, no
`GEMINI_API_KEY` and no native/field audio driver configuration. Therefore no
live latency, persona, road-noise or cost numbers are claimed and no default
provider is selected.

Run when the secure credentials and the fixed live audio environment are
available:

```sh
OPENAI_API_KEY=... \
GEMINI_API_KEY=... \
M4_LIVE_BENCHMARK_DRIVER=/absolute/path/to/live-driver.js \
npm run benchmark:m4:live --workspace server
```

Production examples deliberately use
`REALTIME_VOICE_PROVIDER=select-after-benchmark`; production config rejects
that placeholder. Release acceptance therefore remains **FAIL/BLOCKED** until
the side-by-side live report is attached and a configured route is approved.

## Intended behavior statement

No intended Discovery behavior change. No JourneyState ownership change. No
M3 product-semantics change. No always-on listening, wake word, transcript UI,
provider-owned memory or separate chatbot mode was added.
