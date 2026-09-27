# Core Experience v2 — Milestone 4 Implementation Specification
## Realtime Voice

**Status:** Implementation-ready  
**Priority:** P0  
**Parent architecture:** `Core_Experience_v2_Canonical.md`  
**Execution plan:** `Core_Experience_v2_Implementation_Milestones.md`  
**Prerequisite:** M1, M2, M3 merged and post-merge deployed successfully.

---

## 1. Goal

M4 makes the M3 Conversation Runtime usable as a natural voice interaction without moving product authority into a realtime provider.

Target experience:

```text
normal narration
  -> user explicitly starts/interupts voice conversation
  -> story audio pauses immediately
  -> realtime audio session becomes active
  -> provider emits a validated user utterance/turn
  -> M3 Conversation Runtime resolves intent/tools/answer/resume
  -> realtime provider speaks the grounded M3 answer
  -> conversation may continue for a short active window
  -> inactivity closes realtime session
  -> original story resumes or remains abandoned according to M3 policy
```

Realtime voice is a transport and rendering layer over M3.

---

## 2. Canonical authority boundary

M4 must preserve:

- Discovery owns target selection and speak/silence.
- JourneyState owns what actually happened.
- M3 ConversationRuntime owns interruption state, turn races, validated tool results and resume/abandon.
- ConversationService owns intent/tool orchestration and grounded answer content.
- Realtime provider owns audio transport, provider turn detection/VAD integration and audio rendering.
- LLM/provider must not directly decide navigation destinations, POIs, resume/abandon, Journey outcomes, Discovery selection or budgets.

Correct pattern:

```text
microphone/audio
 -> RealtimeConversationProvider
 -> normalized user turn
 -> M3 ConversationService
 -> typed tool actions + grounded answer text
 -> RealtimeConversationProvider
 -> streaming spoken answer
```

Provider-native tool calling may be used only as a transport bridge to a fixed Hey City capability and must never bypass M3 validation.

---

## 3. Provider-independent contracts

Create/confirm canonical contracts, suggested under:

`server/src/voice/`

### 3.1 SpeechProvider

Normal narration remains independent from realtime voice.

```ts
interface SpeechProvider {
  readonly id: string;

  synthesize(request: {
    text: string;
    guideId: string;
    language: string;
    signal?: AbortSignal;
  }): Promise<{
    audioUrl?: string;
    audioBytes?: Uint8Array;
    providerId: string;
    model: string;
    latencyMs?: number;
    estimatedCostUsd?: number;
  }>;
}
```

Existing OpenAI TTS behavior may be adapted behind this interface. Do not rewrite the narrative pipeline solely for M4.

### 3.2 RealtimeConversationProvider

```ts
interface RealtimeConversationProvider {
  readonly id: string;

  createSession(config: RealtimeSessionConfig): Promise<RealtimeProviderSession>;
}

interface RealtimeSessionConfig {
  sessionId: string;
  guideId: string;
  language: string;
  voiceProfile: RealtimeVoiceProfile;
  inactivityTimeoutMs: number;
  clientTransport: 'webrtc' | 'websocket' | 'native';
}

interface RealtimeProviderSession {
  readonly providerSessionId: string;

  issueClientConnection(): Promise<RealtimeClientConnection>;
  submitAnswer(input: RealtimeAnswerInput): Promise<void>;
  cancelResponse(): Promise<void>;
  close(reason: RealtimeCloseReason): Promise<void>;
}
```

Provider-specific SDP, ephemeral tokens, WebSocket URLs and event payloads must remain inside provider adapters.

Do not expose permanent provider API keys to clients.

---

## 4. Realtime session owner

Create one server-owned `RealtimeVoiceSession` per active Hey City DriveSession at most.

Suggested boundary:

`server/src/services/realtimeVoiceSession.ts`

It owns:

- selected realtime provider ID;
- provider session lifecycle;
- active/inactive state;
- current client connection generation;
- audio-turn correlation IDs;
- latency timestamps;
- inactivity timer;
- cancellation linkage to M3 turn;
- bounded provider usage/cost counters.

It does not own:

- conversation memory;
- tool results;
- target selection;
- answer facts;
- resume policy.

States may be:

```text
closed
 -> connecting
 -> ready
 -> listening
 -> processing
 -> speaking
 -> idle_window
 -> closed
```

---

## 5. Activation model

MVP must not keep an expensive realtime session permanently open.

Initial activation:

- normal narration uses quality TTS;
- user starts voice conversation explicitly from the client interaction surface;
- client pauses current story audio immediately using the M3 playback path;
- client opens/attaches realtime transport;
- session remains available for a short configurable follow-up window;
- after inactivity timeout, close provider session.

Do not require always-on microphone during ordinary narration.

Inside an already-active realtime conversation, provider VAD/turn detection may support natural subsequent turns and barge-in.

Wake-word support is out of scope.

---

## 6. First interruption

The first voice interruption must preserve the M3 invariant:

1. local story audio pauses before network round trip;
2. original `momentId` and playback position are preserved;
3. M3 `conversation/interrupt` is called exactly once for that story interruption;
4. opening/connecting the realtime provider must not mark the story complete;
5. provider failure must leave the story resumable.

Target acknowledgement/interaction transition should feel immediate; the client should visually/audio-indicate listening without waiting for answer generation.

---

## 7. Audio input and normalized user turn

Provider adapters may use provider-native transcription/turn detection, but M3 receives a bounded normalized user turn.

Suggested event:

```ts
interface RealtimeUserTurn {
  voiceTurnId: string;
  text: string;
  isFinal: boolean;
  startedAt: string;
  endedAt?: string;
  providerId: string;
  providerConfidence?: number;
}
```

Only final turns are submitted to M3 ConversationService.

Do not persist raw audio or raw transcript in product telemetry.

If the provider emits partial transcripts, they are transport-only and ephemeral.

---

## 8. M3 bridge

Create one bridge, suggested:

`server/src/services/realtimeConversationBridge.ts`

Responsibilities:

1. accept final `RealtimeUserTurn`;
2. call existing M3 ConversationService through the same typed turn path;
3. preserve M3 latest-turn-wins behavior;
4. return answer text + map/navigation actions + resume directive;
5. submit only the grounded answer text to the realtime provider for speech;
6. propagate cancellation when a newer voice turn supersedes the current response.

Do not implement a parallel voice-specific intent resolver or tool system.

Text/API M3 tests must remain valid.

---

## 9. Response audio

For active realtime conversation, prefer low-latency provider audio output.

The realtime provider receives **grounded M3 answer text**, plus only the minimum voice rendering instructions required for:

- guide voice identity;
- language;
- speaking pace/style;
- no additional factual improvisation.

The provider must not add new factual content beyond the approved answer.

If exact-text rendering cannot be reliably constrained for a provider, the adapter must expose that limitation in benchmark results. Do not silently accept factual drift.

Fallback:

- if realtime response audio fails after M3 produces valid text, normal `SpeechProvider`/TTS may render the answer;
- fallback must not create another M3 turn or repeat tool execution.

---

## 10. Barge-in during realtime response

When the user starts speaking while the realtime answer is playing:

1. stop/duck provider response immediately;
2. cancel provider output;
3. cancel/supersede the prior voice response generation where applicable;
4. begin a new voice turn;
5. M3 latest-turn-wins rules remain authoritative.

A late audio chunk from the cancelled response must not play after a newer turn begins.

---

## 11. Resume/abandon integration

M4 must consume the existing M3 `ResumeDirective`.

### resume_existing

- finish/cancel current conversation answer audio;
- confirm M3 resume with original `momentId`;
- resume the same original story audio position;
- do not regenerate story.

### abandon_previous

- clear suspended story playback;
- never call legacy completion endpoint as `ended`;
- Journey outcome remains the M3 non-completed result.

### stay_idle

- do not restart old audio automatically.

Realtime provider never chooses the directive.

---

## 12. Client transport adapters

Create a client-side abstraction so UI does not depend on a provider SDK.

Suggested:

```ts
interface RealtimeVoiceTransport {
  connect(connection: RealtimeClientConnection): Promise<void>;
  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  interruptOutput(): Promise<void>;
  close(): Promise<void>;
  onEvent(handler: (event: RealtimeClientEvent) => void): Unsubscribe;
}
```

Initial implementations may differ by platform:

- Web may use WebRTC where supported/preferred by provider.
- Native mobile may require a native-capable transport/dev build.
- Server WebSocket transport may be used for benchmark/debug where appropriate.

Do not couple ConversationRuntime to Expo, WebRTC or a vendor SDK.

If Expo Go cannot support the chosen native realtime transport, document the requirement for a development/native build rather than compromising architecture.

---

## 13. Session credentials and security

Provider credentials are server-owned.

Client connection must use:

- short-lived/ephemeral credentials, or
- a server-mediated session establishment flow.

Never ship long-lived OpenAI, Google or other provider API keys in Web/mobile bundles.

Credentials must be scoped to a single realtime session when provider capability permits.

Log no secrets.

---

## 14. Inactivity and cost policy

Configurable operational values belong in `config.ts` / env.

Suggested settings:

- provider route;
- realtime model;
- inactivity timeout;
- maximum active session duration;
- reconnect backoff;
- maximum simultaneous realtime sessions;
- audio input/output budget guardrails.

Do not put provider pricing directly into business logic.

Normal story narration must not open a realtime session.

An inactive realtime session must be closed after the configured window.

---

## 15. Provider routing

Create provider-independent routing rather than provider conditionals across services.

Suggested:

`server/src/voice/realtimeProviderRouter.ts`

It should resolve:

```text
configured provider id
 -> RealtimeConversationProvider
```

M4 initial benchmark candidates:

- OpenAI Realtime;
- Gemini Live.

The benchmark determines which provider becomes the default. The architecture must allow adding/replacing providers without changing M3.

Do not make fallback from provider A to B automatically mid-session unless state-transfer semantics are explicitly tested. Initial MVP may close/reopen on fallback.

---

## 16. Benchmark harness

Create a deterministic benchmark harness using the same scripts and instrumentation for every provider.

Do not score providers from reputation or manual impression alone.

### Required scripts

#### B1 — interruption
Story audio is playing.
User begins voice conversation and asks:
> Where can I get coffee nearby?

Measure:
- local pause latency;
- provider connection readiness;
- speech-end -> final recognized turn;
- speech-end -> first response audio;
- successful M3 NearbySearch;
- same-moment resume.

#### B2 — contextual follow-up
> Why is that important?

Measure:
- recognition correctness;
- M3 grounding/tool correctness;
- first audio;
- factual drift from approved answer.

#### B3 — barge-in
Provider is speaking.
User interrupts:
> No, I meant parking.

Measure:
- output stop latency;
- stale audio after interruption;
- new turn recognition;
- latest-turn correctness.

#### B4 — road noise
Run a controlled background-noise fixture / field sample.

Measure:
- final transcript correctness;
- false turn starts;
- missed speech;
- response latency.

Do not persist raw user field recordings in product telemetry.

#### B5 — Dana vs Artur
Use identical approved answer content.

Measure:
- persona/voice distinguishability;
- naturalness;
- pacing;
- factual preservation.

#### B6 — session lifecycle
Two or more follow-ups then inactivity.

Measure:
- connection reuse;
- close after timeout;
- no billing/requests after close;
- clean restart.

---

## 17. Benchmark metrics

Record for each provider/model/transport:

- connect latency p50/p95;
- interruption/local pause latency;
- end-of-user-speech -> final turn latency;
- end-of-user-speech -> first response audio p50/p95;
- barge-in output-stop latency;
- tool-call success rate through M3;
- transcript correctness;
- factual preservation against M3 answer;
- persona preservation;
- noise handling;
- reconnect success;
- audio failures;
- input audio usage;
- output audio usage;
- estimated cost per active conversation minute;
- estimated cost for a representative 30-minute city session with realistic active-conversation duty cycle.

Keep latency measurements timestamp-based, not subjective.

Naturalness/persona/noise may include a small human rubric, but report raw technical measures separately.

---

## 18. Benchmark decision policy

Do not embed a permanent provider winner in the canonical architecture.

M4 PR report must present a side-by-side comparison and a recommended default provider based on:

1. interruption/first-audio latency;
2. tool reliability through M3;
3. factual preservation;
4. persona/voice quality;
5. road-noise behavior;
6. cost;
7. client transport complexity;
8. operational maturity.

Provider route remains configuration.

If no provider meets release thresholds, M4 may PASS architecture/tests but FAIL product release gate. Do not hide that distinction.

---

## 19. Voice persona

Guide voice configuration must live outside provider adapters as a provider-neutral voice profile where possible.

Suggested:

```ts
interface RealtimeVoiceProfile {
  guideId: string;
  language: string;
  speakingStyle: string[];
  pace?: 'slow' | 'normal' | 'brisk';
  providerVoiceHint?: string;
}
```

Provider-specific voice IDs may be stored in guide/provider configuration, but guide identity must not be defined by one vendor voice ID.

Dana and Artur must remain recognizably different.

---

## 20. Telemetry and privacy

Add bounded events such as:

- `realtime_session_started`
- `realtime_session_ready`
- `realtime_user_turn_final`
- `realtime_response_first_audio`
- `realtime_barge_in`
- `realtime_session_closed`
- `realtime_provider_error`

Persist only bounded metadata:

- provider/model/transport;
- guide/language;
- latency buckets or numeric bounded latency;
- turn count;
- close reason;
- usage/cost estimates;
- success/failure;
- coarse session context if already allowed.

Do not persist in product telemetry:

- raw microphone audio;
- raw transcript;
- full answer text;
- exact GPS;
- provider secrets;
- raw realtime event payloads.

Provider billing/usage telemetry should use the existing usage system.

---

## 21. Failure behavior

### provider connection failure

- M3 state remains valid;
- suspended story remains resumable;
- user receives a concise fallback indication;
- normal TTS/text conversation path may remain available.

### transcription failure / no speech

- do not send empty/unstable turns to M3;
- remain listening or close on inactivity.

### realtime output failure

- preserve M3 answer;
- optionally render via SpeechProvider fallback;
- do not repeat tools.

### session disconnect

- close provider resources;
- no phantom completion;
- user may reopen a new realtime session.

### provider rate/budget guardrail

- stop opening new realtime sessions;
- preserve normal narration/TTS path where allowed.

---

## 22. Race/cancellation rules

M4 must preserve M3 latest-turn-wins semantics.

Required:

- voiceTurnId maps deterministically to one M3 turn;
- newer voice input cancels stale provider output;
- closing the DriveSession closes realtime provider session;
- guide/language change closes/reconfigures realtime session;
- stale provider events after close are ignored;
- reconnect cannot resurrect an old M3 turn;
- resume action from a superseded turn cannot restart story audio.

---

## 23. Mandatory automated tests

### T1 — No idle realtime cost
Starting a normal DriveSession does not create a realtime provider session.

### T2 — One realtime owner
At most one realtime session per DriveSession.

### T3 — Ephemeral credential boundary
Client never receives a long-lived provider API key.

### T4 — Valid activation
Voice activation pauses original story and opens realtime session without completing it.

### T5 — Provider failure preserves story
Connection failure leaves original moment resumable.

### T6 — Final-turn bridge
Only a final normalized voice turn reaches M3.

### T7 — No parallel intent system
Voice turn uses the existing M3 ConversationService path.

### T8 — Grounded response
Provider receives only approved M3 answer text plus rendering/persona instructions.

### T9 — No factual provider drift contract
Adapter/harness detects response text/transcript divergence when provider output is inspectable; provider limitation is surfaced otherwise.

### T10 — Coffee interruption
Voice coffee request produces same validated M3 NearbySearch/map behavior as text M3.

### T11 — Same-moment resume
After spoken response, original story audio resumes from original moment/position.

### T12 — Stop/change topic
M3 abandon directive prevents story resume and phantom completion.

### T13 — Barge-in
New speech cancels active realtime output; late audio is ignored.

### T14 — Latest turn wins
Turn B supersedes Turn A across provider + M3 bridge.

### T15 — Inactivity close
Provider session closes after configured inactivity.

### T16 — Reopen
A closed realtime session can be cleanly recreated without stale state.

### T17 — Guide/language change
Provider session closes/reconfigures; stale audio/events cannot leak.

### T18 — Session end cleanup
DriveSession end closes realtime transport/provider work.

### T19 — Privacy
Realtime telemetry contains no raw audio/transcript/answer/secret/exact GPS.

### T20 — Cost accounting
Provider usage/cost is attributable to realtime operations and zero when no realtime session is opened.

### T21 — Provider substitution
Contract tests run against at least two provider adapters or one real + one deterministic reference adapter without changing M3.

### T22 — Existing regressions
M1, M2, M3 and Discovery suites remain green.

---

## 24. Realtime replay / benchmark acceptance

Implement deterministic/provider-mocked replay for CI plus live benchmark harness where credentials are available.

### R1 — voice coffee interruption
Passes M3 coffee semantics with realtime transport.

### R2 — voice contextual follow-up
"Why is that important?" uses active StoryEvidence.

### R3 — barge-in
User interrupts spoken answer; stale audio/action does not publish.

### R4 — stop then silence
Story does not resume; no phantom completion.

### R5 — session timeout and reopen
Realtime closes after inactivity and reopens cleanly.

### R6 — provider comparison
Run B1–B6 against both benchmark candidates and emit comparable metrics.

CI must not require live paid-provider credentials to pass deterministic tests. Live benchmark may be a separately invoked job/report.

---

## 25. Client UX boundary

M4 adds the minimum voice interaction surface:

- explicit start/interrupt control;
- listening state;
- speaking/responding state;
- cancel/close behavior;
- permission/error state.

Do not redesign Explore/Drive UI broadly.

Vehicle mode remains audio-first with minimal visual interaction.

No transcript-first chatbot surface is required.

---

## 26. Definition of Done

### Architecture

PASS only if:

- `SpeechProvider` and `RealtimeConversationProvider` boundaries exist;
- M3 remains the single conversation/business-logic path;
- provider APIs are isolated;
- no permanent provider key ships to client;
- realtime session is not always-on by default;
- provider choice is configurable.

### Experience

PASS only if:

- voice interruption preserves story state;
- coffee/follow-up M3 scenarios work through voice;
- barge-in cancels stale response;
- same story resumes correctly;
- Dana/Artur voice profiles remain distinct.

### Performance

Report:

- connection latency;
- speech-end -> final turn;
- speech-end -> first response audio;
- barge-in stop latency;
- p50/p95 where sample size permits.

Product target remains:
- interruption acknowledgement/local pause preferably <500 ms;
- simple voice follow-up preferably begins response around <1.5 s when provider/network permit.

These are targets, not fabricated guarantees.

### Cost/privacy

PASS only if:

- zero realtime cost while unused;
- active session timeout works;
- per-provider usage/cost is measured;
- raw audio/transcript is not persisted by Hey City product telemetry.

### Benchmark

M4 is not complete without a documented side-by-side benchmark of at least two viable realtime providers using the same scripts.

---

## 27. Stop conditions

Work must stop and report instead of improvising if:

- provider integration appears to require bypassing M3 tools/intent/resume policy;
- a permanent provider key would need to ship to client;
- a provider can only be integrated by making it the system of record for conversation memory;
- mobile transport requires native modules unavailable in Expo Go — document and use an appropriate development/native build path instead;
- benchmark cannot be made comparable across providers;
- voice testing would require storing raw user recordings in product telemetry;
- satisfying M4 requires changing Discovery.

---

## 28. Work Mode execution instruction

> Implement **Core Experience v2 — Milestone 4: Realtime Voice** according to
> `docs/context/Core_Experience_v2_M4_Realtime_Voice_Implementation_Spec.md`.
>
> M1–M3 are merged. Reuse M3 ConversationRuntime/ConversationService exactly as the business-logic authority.
>
> Realtime providers are transport/audio layers, not a second agent brain.
>
> Implement provider-independent SpeechProvider and RealtimeConversationProvider boundaries, session lifecycle, secure client connection establishment, M3 bridge, interruption/barge-in, inactivity close, telemetry/cost accounting and deterministic tests.
>
> Benchmark OpenAI Realtime and Gemini Live with identical B1–B6 scripts. Do not hard-code a provider winner.
>
> Do not change Discovery, M3 product semantics, Journey ownership or navigation authority.
>
> Work in a dedicated branch and Draft PR. Do not merge it.
>
> Run deterministic CI without requiring paid live credentials. Produce a separate live benchmark report when provider credentials are available.
