# Core Experience v2 — Milestone 3 Implementation Specification
## Conversation Runtime

**Status:** Implementation-ready  
**Priority:** P0  
**Parent architecture:** `Core_Experience_v2_Canonical.md`  
**Execution plan:** `Core_Experience_v2_Implementation_Milestones.md`  
**Prerequisite:** M1 + M2 + product-policy refactor merged in `main`

---

## 1. Goal

M3 turns narration into one interruptible Guide Session.

The user must be able to interrupt an active story, ask a contextual question or request, receive a grounded tool-backed answer in the selected guide voice, and then either resume the interrupted story or abandon it without corrupting Journey Memory.

Canonical state path:

```text
NARRATING
 -> user interruption
 -> LISTENING
 -> UNDERSTANDING
 -> TOOL_EXECUTION or RESPONDING
 -> RESUME_DECISION
 -> NARRATING or IDLE
```

M3 is **Conversation Runtime**, not Realtime Voice.

---

## 2. Scope boundary

### M3 includes

- one server-owned conversation runtime per active DriveSession;
- interruption/suspend/resume semantics;
- text-turn API suitable for deterministic tests and later voice transport;
- validated intent routing;
- conversation tool layer;
- contextual follow-up grounding;
- nearby search for explicit user requests such as coffee;
- recommendation/navigation intents through validated tools;
- guide-voice answer generation;
- normal TTS for conversation responses;
- JourneyQuestionMemory integration;
- privacy-safe conversation telemetry;
- map-highlight and navigation-handoff response actions;
- deterministic resume/abandon policy;
- replay acceptance for interruption and contextual follow-up.

### M3 explicitly excludes

- microphone capture;
- wake word / VAD;
- streaming STT;
- realtime bidirectional audio session;
- realtime provider benchmarking;
- always-on audio;
- provider-specific realtime session lifecycle.

Those are M4.

A small text/debug harness may be used for M3 QA, but do not introduce a disconnected production chatbot mode. In vehicle mode do not add a UI that encourages manual typing while moving.

---

## 3. Existing architecture to preserve

```text
Discovery / Guide Brain
 -> approved target
 -> StoryBrief
 -> NarrativePlan
 -> NarrativeGenerator
 -> TTS
 -> Conversation Runtime
```

Existing authorities remain unchanged:

- Discovery selects targets and decides speak/silence.
- JourneyState owns what actually happened.
- StoryBrief/NarrativePlan own grounded story intent.
- GenerativeProvider formulates language only.
- mapping/navigation providers do not own product decisions.
- policy modules contain mutable deterministic product rules.

Conversation Runtime must not become a second Discovery engine.

---

## 4. One conversation runtime owner

Each active `DriveSession` owns one server-side `ConversationRuntime`.

Suggested boundary:

`server/src/services/conversationRuntime.ts`

Suggested state:

```ts
type ConversationState =
  | 'idle'
  | 'narrating'
  | 'listening'
  | 'understanding'
  | 'tool_execution'
  | 'responding'
  | 'resume_decision';

interface ConversationRuntimeSnapshot {
  state: ConversationState;
  activeTurnId?: string;
  suspendedStory?: {
    momentId: string;
    entityId: string;
    entityName: string;
    level: 'auto' | 'short' | 'long';
    listenedSeconds?: number;
  };
  lastIntent?: ConversationIntent;
  lastTool?: ConversationToolName;
}
```

Do not duplicate JourneyState. ConversationRuntime references JourneyState and the current active story.

---

## 5. Interruption semantics

### 5.1 Client behavior

When the user starts a conversation while narration is playing:

1. pause/duck local playback immediately;
2. preserve the local playback position;
3. send interruption metadata to the server;
4. do not wait for a server round trip before stopping audio.

### 5.2 Server behavior

Interruption validates:
- active session;
- active `momentId`;
- moment matches the user's current story.

Then:
- ConversationRuntime stores the suspended story reference;
- `alreadyListening` is cleared for the conversation response path;
- the Journey moment remains unfinished;
- no `completed` outcome is written;
- no callback is consumed;
- no full story evidence set is marked heard merely because interruption occurred.

### 5.3 Resume

If resume policy returns `resume_existing`:
- return the original `momentId`;
- client resumes the same existing audio from its local position;
- do not regenerate the interrupted story;
- do not create a second Journey moment.

### 5.4 Abandon

If the user changes topic/stops/navigates away:
- old story is finalized conservatively as non-completed;
- it must not become a callback source claiming the full story was heard;
- preserve listenedSeconds in telemetry when available.

Do not silently use M2 `completed` semantics for a partially heard story.

---

## 6. Public conversation contracts

Additive shared contracts are acceptable.

Suggested:

```ts
type ConversationIntent =
  | 'ask_about_current_story'
  | 'ask_about_visible_object'
  | 'ask_about_area'
  | 'nearby_search'
  | 'recommendation_request'
  | 'navigation_request'
  | 'go_deeper'
  | 'repeat'
  | 'stop_story'
  | 'resume_story'
  | 'change_topic'
  | 'general_contextual_question';

type ConversationToolName =
  | 'NearbySearch'
  | 'PlaceDetails'
  | 'CurrentTarget'
  | 'CurrentArea'
  | 'JourneyRecall'
  | 'StoryEvidence'
  | 'MapHighlight'
  | 'NavigationHandoff';

type ResumeDirective =
  | { action: 'resume_existing'; momentId: string }
  | { action: 'abandon_previous'; momentId?: string }
  | { action: 'stay_idle' };

interface ConversationTurnResult {
  turnId: string;
  intent: ConversationIntent;
  answerText: string;
  audioUrl?: string;
  toolResults?: ConversationToolResult[];
  mapActions?: MapAction[];
  navigationAction?: NavigationAction;
  resume: ResumeDirective;
}
```

Raw provider payloads must not cross this boundary.

---

## 7. Canonical endpoints

Suggested session-scoped API:

```text
POST /sessions/:sessionId/conversation/interrupt
POST /sessions/:sessionId/conversation/turn
POST /sessions/:sessionId/conversation/resume
POST /sessions/:sessionId/conversation/cancel
```

### interrupt

Input:
- `momentId`
- optional `listenedSeconds`

Idempotent for the same active moment.

### turn

Input:
- text
- optional client turn ID
- optional language override only if already supported by session policy

The endpoint uses the current DriveSession/JourneyContext. It does not accept caller-supplied GPS, target identity, evidence, or tool results as authoritative context.

### resume/cancel

Explicit control endpoints for client lifecycle and race safety.

---

## 8. Intent resolution

Create one canonical `ConversationIntentResolver`.

### 8.1 Deterministic fast paths

Obvious commands should not require an LLM:
- stop;
- resume/continue;
- repeat;
- deeper/more;
- navigation phrases when target is explicit;
- clearly typed nearby category requests when deterministic parsing is sufficient.

Support both current app languages.

### 8.2 Ambiguous language

An LLM may classify ambiguous language, but:

- use existing `AITaskRouter`;
- add a conversation-specific task kind only if existing `complex_follow_up` cannot cleanly support structured intent;
- require strict structured output;
- validate against the allowed intent enum;
- model output cannot directly execute a provider or mutate JourneyState.

Invalid model output falls back safely to `general_contextual_question` or a deterministic clarification response.

---

## 9. Tool layer

Create a provider-independent product tool boundary, suggested:

`server/src/conversation/tools/`

Each tool returns typed, bounded data.

### 9.1 CurrentTarget

No provider call.

Reads current approved target / active story context.

### 9.2 CurrentArea

No provider call.

Reads JourneyContext area.

### 9.3 JourneyRecall

No provider call.

Returns validated recent entities/topics/outcomes, never raw history dumps.

### 9.4 StoryEvidence

No provider call if evidence is already available in active story context.

M3 must retain enough active StoryBrief/evidence context server-side to answer follow-ups such as:

> Why is that important?

Do not refetch source material if the current grounded evidence is already available.

### 9.5 NearbySearch

This is **not Discovery**.

An explicit user request such as "coffee nearby" may search commercial places intentionally excluded from Discovery.

Create a separate provider-independent search contract.

Suggested:

```ts
interface NearbySearchRequest {
  queryCategory: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit: number;
}

interface NearbySearchResult {
  id: string;
  name: string;
  category?: string;
  latitude: number;
  longitude: number;
  distanceMeters?: number;
  address?: string;
}
```

Google implementation may reuse the Places New infrastructure, but:
- use separate cache keys/operation names;
- apply conversation-search policy, not Discovery taxonomy;
- count Google cost separately;
- cap results;
- do not expose numeric Google ratings in spoken response.

### 9.6 PlaceDetails

Fetch only when necessary for the explicit conversation request.

Do not automatically fetch details for every nearby result.

### 9.7 MapHighlight

Pure product/UI action.

Returns place IDs/coordinates/labels for client rendering.

No LLM controls the map directly.

### 9.8 NavigationHandoff

Returns a structured destination:
- place ID when available;
- coordinates;
- display name.

Client applies the user's configured navigation-app policy.

Do not hard-code one navigation provider into conversation business logic.

---

## 10. Conversation answer generation

Conversation answers use existing provider-independent generation.

Suggested task:
- `complex_follow_up`, unless a new typed task is clearly justified.

Prompt/input must separate:

1. validated intent;
2. guide policy;
3. current target/area;
4. validated tool results;
5. bounded JourneyContext;
6. StoryEvidence when applicable;
7. forbidden narrative patterns.

Rules:
- use only supplied factual evidence/tool results;
- never invent a nearby place;
- never claim a prior discussion that JourneyState does not contain;
- do not read URLs/source metadata aloud;
- concise spoken answer by default;
- guide persona affects language, not factual selection.

Conversation response may use existing TTS. Realtime voice is M4.

---

## 11. Resume decision policy

Resume is deterministic product policy, not an LLM decision.

Create `conversationResumePolicy.ts` under `src/policies/`.

Initial behavior:

- current-story factual question -> resume existing story by default;
- area question -> resume existing story if short and context still relevant;
- nearby search/recommendation -> resume existing story unless user selects a new place/topic;
- explicit resume -> resume;
- explicit stop -> abandon;
- change topic -> abandon;
- navigation request accepted -> abandon unless product flow explicitly remains in place;
- no suspended story -> stay idle.

LLM may phrase the transition but may not choose the resume action.

---

## 12. Active Story Context

M3 requires a server-side bounded context for the currently generated story.

Suggested:

```ts
interface ActiveStoryContext {
  momentId: string;
  subjectId: string;
  subjectName: string;
  level: NarrativeLevel;
  plan: Pick<NarrativePlan, 'moment' | 'narrativeAngle' | 'evidenceRefs'>;
  evidence: EvidenceBundle;
  guideId: string;
  language: string;
}
```

Store only while relevant to the active/suspended story.

Clear on:
- confirmed completion;
- explicit abandon;
- supersede;
- session end.

Do not persist full transcript/evidence into usage telemetry.

---

## 13. Journey Memory integration

Every accepted user turn calls the existing M2 question helper with bounded structured data:

- timestamp;
- validated intent;
- subjectId when known;
- normalizedTopic when deterministic.

Do not store raw user text in JourneyState.

A conversation question does not imply that a story was completed.

---

## 14. Telemetry and privacy

Add bounded operations such as:

- `conversation_interrupted`
- `conversation_turn`
- `conversation_tool`
- `conversation_response`
- `conversation_resume_decision`

Persist:
- intent;
- tool name;
- success/failure;
- latency buckets;
- result count;
- resume action;
- provider/cost usage through existing provider telemetry.

Do not persist in product telemetry:
- raw user text;
- full generated answer;
- raw transcript;
- exact GPS;
- raw Places provider payload;
- raw evidence claims.

Use coarse location bucket where location telemetry is necessary.

---

## 15. Cost rules

M3 must not increase idle/narration-path cost.

No conversation request -> no additional M3 LLM or Maps call.

Per conversation turn:

- deterministic control intent: 0 classification model calls;
- simple current-context question: max 1 generation call;
- explicit nearby search: max 1 Places search + max 1 answer-generation call;
- ambiguous tool intent: at most 1 classification call + required tool + 1 answer-generation call;
- PlaceDetails only when necessary.

Report actual call topology in PR.

---

## 16. Race and cancellation rules

Conversation must be safe under rapid input.

Required:

- each turn has a unique `turnId`;
- latest accepted turn may supersede an earlier in-flight turn;
- aborted tool/model work cannot overwrite the newer turn;
- stale resume/cancel requests cannot affect a newer story;
- session end aborts active conversation work;
- changing guide/language invalidates incompatible in-flight response generation;
- a late conversation answer cannot resurrect a superseded story.

Reuse AbortController patterns already used by story selection where appropriate.

---

## 17. Mandatory tests

### T1 — Runtime lifecycle
New session begins idle and owns exactly one ConversationRuntime.

### T2 — Valid interruption
Active story + matching momentId becomes suspended without marking Journey moment completed.

### T3 — Stale interruption
Old/wrong momentId cannot suspend or mutate the current story.

### T4 — Immediate resume contract
Resume result references the same original moment; no second story moment is created.

### T5 — Abandon safety
Abandoned interrupted story never becomes completed/callback source.

### T6 — Current story question
"Why is that important?" resolves against active StoryEvidence/current target without a new Discovery decision.

### T7 — Current area question
Uses JourneyContext area; unknown area remains unknown.

### T8 — Nearby coffee
Explicit coffee request uses Conversation NearbySearch, not Discovery filtering.

### T9 — Discovery separation
Cafe/store results can be returned by conversation search while remaining excluded from automatic Discovery where current policy excludes them.

### T10 — Map action
Nearby result can produce a typed MapHighlight action.

### T11 — Navigation handoff
Validated destination produces structured NavigationHandoff; no provider-specific product authority.

### T12 — Journey question memory
Accepted turn records intent/topic/subject only; no raw text.

### T13 — Deterministic commands
stop/resume/repeat/go deeper obvious forms require no classifier model call.

### T14 — Ambiguous intent validation
Invalid/unrecognized model intent cannot execute arbitrary tools.

### T15 — Grounding
Conversation generator receives only validated tool/evidence/context data; unsupported tool names/facts are rejected.

### T16 — Persona
Same tool result answered by Dana vs Arthur preserves facts but differs in guide policy.

### T17 — Race
Turn B supersedes in-flight turn A; A cannot write response/resume state.

### T18 — Session/guide cleanup
Session end or incompatible guide/language change aborts conversation work and clears suspended context safely.

### T19 — Privacy
Persisted conversation telemetry contains no raw user text, generated answer, exact GPS, source claims, or provider payload.

### T20 — Cost isolation
With no conversation turns, M1/M2 narration call topology is unchanged.

---

## 18. Replay acceptance scenarios

### R1 — Coffee interruption

State:
- Dana narrating Federal Hall.
- user interrupts mid-story.

User:
> Where can I get coffee nearby?

Expected:
1. current playback pauses locally;
2. server preserves Federal Hall moment;
3. intent = nearby_search;
4. Conversation NearbySearch searches coffee/cafe using current movement context;
5. result is grounded in tool output;
6. map action is available;
7. answer is concise and in Dana voice;
8. resume directive = resume_existing unless user chooses a new destination;
9. resuming uses the same Federal Hall moment/audio.

### R2 — Contextual follow-up

User during/after Federal Hall:
> Why is that important?

Expected:
- current subject resolved without retyping "Federal Hall";
- StoryEvidence/JourneyContext used;
- no extra Places call;
- one grounded response generation call maximum;
- prior story may resume.

### R3 — Stop

User:
> Stop the story.

Expected:
- deterministic intent;
- no classifier/model call required for the command;
- interrupted story abandoned;
- no false completion/callback.

### R4 — Navigation change

User selects a coffee result and asks:
> Take me there.

Expected:
- navigation_request;
- NavigationHandoff for the selected validated result;
- previous story abandoned;
- no LLM-selected destination substitution.

### R5 — Rapid supersede

Turn A starts nearby search.
Before completion user submits Turn B: "Never mind, continue."

Expected:
- A cancelled;
- late provider/model result cannot alter state;
- Turn B resumes original story safely.

---

## 19. Client integration

M3 clients need only the minimum runtime integration:

- pause/resume existing story playback by moment ID;
- send interruption/turn/resume/cancel;
- render conversation response text/audio;
- apply map-highlight action;
- apply navigation handoff.

Do not redesign the whole UI.

For vehicle safety:
- production Drive UI must not introduce a typing-first interaction while moving;
- automated/API test harness may use text;
- realtime voice input comes in M4.

---

## 20. Definition of Done

### Architecture

PASS only if:
- one ConversationRuntime per DriveSession;
- JourneyState is reused, not duplicated;
- Discovery authority remains unchanged;
- conversation tools are typed/provider-independent;
- resume decision is deterministic product policy;
- no realtime-provider dependency is introduced.

### Experience

PASS only if:
- coffee interruption replay passes end-to-end;
- contextual "Why is that important?" is grounded;
- same story can resume without generating a duplicate story moment;
- stop/change-topic cannot create phantom completion;
- no separate disconnected chatbot state exists.

### Cost/privacy

PASS only if:
- no added idle narration cost;
- explicit nearby search cost is bounded and reported;
- raw user text is absent from persisted product telemetry;
- exact GPS/raw provider payload/raw evidence are not persisted in conversation telemetry.

### Regression

PASS only if:
- M1 suite passes;
- M2 suite passes;
- Discovery policy regression passes;
- full server tests pass;
- client tests pass;
- production Docker builds pass.

---

## 21. Stop conditions

Work must stop and report instead of improvising if:

- M3 appears to require changing Discovery ranking/target ownership;
- correct resume requires introducing realtime audio streaming;
- a new persistent conversation transcript database seems necessary;
- tool execution would require letting an LLM call providers directly;
- Drive-mode text UI is the only way to satisfy acceptance;
- navigation requires hard-coding a single provider into business logic.

---

## 22. Work Mode execution instruction

> Implement **Core Experience v2 — Milestone 3: Conversation Runtime** according to
> `docs/context/Core_Experience_v2_M3_Conversation_Runtime_Implementation_Spec.md`.
>
> M1/M2 and Issue #9 policy refactor are already merged. Preserve their boundaries.
>
> M3 is text-transport-first runtime infrastructure. Do not implement realtime microphone/audio provider sessions; those are M4.
>
> Build one ConversationRuntime per DriveSession, reuse JourneyState, implement typed conversation tools, interruption/suspend/resume, grounded contextual answers, privacy-safe telemetry and R1–R5 replay.
>
> Conversation NearbySearch is a separate explicit-user-request tool and must not reuse automatic Discovery filtering policy.
>
> Use existing provider abstractions and normal TTS for M3 responses.
>
> Create a dedicated branch and Draft PR. Do not merge it.
>
> Run all mandatory tests/replays and report provider-call/cost deltas honestly.
