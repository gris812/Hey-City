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

Mobile has one provider-neutral lifecycle and two native wire adapters:

- OpenAI uses WebRTC media plus its data-channel codec;
- Gemini uses the same `RealtimeVoiceTransport` boundary with constrained
  ephemeral WebSocket auth, 16 kHz PCM16 microphone capture, local VAD, 24 kHz
  PCM playout and a Gemini-only codec.

Provider choice exists only in the development B1–B6 control and is carried
through an explicitly gated non-production connect field. It is rejected by
default and in production. No OpenAI/Gemini conditional was added to M3,
Discovery or product UI lifecycle code. Expo Go remains unsupported; native
build instructions and microphone permissions are in `mobile/REALTIME_VOICE.md`,
`mobile/eas.json` and `mobile/app.config.js`.

Both adapters report normalized speech/final-turn/M3/first-audio/completion,
barge-in, close and reconnect timestamps. Approved M3 text and provider output
transcription are written only to the controlled benchmark artifact, never to
normal telemetry.

## Native benchmark driver and artifacts

The development build contains one control for selecting provider, B1–B6 and
repetitions without rebuilding or editing data. Every trial records
`live_native`, provider/model, device/OS, build SHA, network, guide, language,
timestamp, usage and the canonical latency events. The artifact schema,
generated summary template, repeated-run cost summarizer and field runbook are
under `evaluation/m4-live/`.

B4 uses the deterministic synthetic fixture `m4-road-noise-v1.wav` (SHA-256
`6d7e534c3976e9a2b9cec8977bcd088e361e19ce580cebd78fe2f8a36a32ba2a`) at
fixed app volume 0.35. It contains no recorded/copyrighted speech. B5 has a
separate 1–5 RU/EN Dana/Artur form; subjective scores are not mixed with
latency. The summarizer calculates cost/run, cost/active voice minute and a
30-minute projection from measured usage and measured duty cycle. Missing
usage or a missing dated pricing snapshot is reported as unavailable, not zero.

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

`expo-doctor` passes 18/18 checks. The known React Native Directory metadata
warning for the already-established `react-native-webrtc` dependency is
explicitly acknowledged in Expo Doctor config; actual device validation is
still required. A clean iOS native prebuild completed with the WebRTC,
AudioStudio and Audio API config plugins. This Linux workspace cannot perform
Apple signing or install to a physical iPhone.

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

Status: **BLOCKED — native field data not executed yet**.

Credentials are available through the existing secure runtime boundary and
are no longer the blocker. No credential value was read into source, logs,
artifacts or this report. The remaining external gate is Expo/Apple account
authorization, iPhone provisioning/install and the paired B1–B6 field run.
Therefore no live latency, persona, road-noise or cost numbers are claimed and
no default provider is selected.

After exporting the iPhone JSON artifact, generate the common report with a
dated non-secret pricing snapshot:

```sh
M4_BENCHMARK_PRICING_JSON='{"source":"dated provider billing snapshot","providers":{"openai":{...},"gemini":{...}}}' \
npm run benchmark:m4:native:summary -- /path/to/m4-run.json
```

Production examples deliberately use
`REALTIME_VOICE_PROVIDER=select-after-benchmark`; production config rejects
that placeholder. Release acceptance therefore remains **FAIL/BLOCKED** until
the side-by-side live report is attached and a configured route is approved.

Security follow-up after M4: split OpenAI/Gemini/VPS/GitHub credentials, move
runtime secrets to GitHub Secrets/server secret storage, and rotate VPS/SSH
credentials if they were stored in one shared plaintext file. This follow-up
does not rotate or rewrite any secret in this PR.

## Intended behavior statement

No intended Discovery behavior change. No JourneyState ownership change. No
M3 product-semantics change. No always-on listening, wake word, transcript UI,
provider-owned memory or separate chatbot mode was added.
