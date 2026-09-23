# Core Experience v2 — Milestone 2 Implementation Specification
## Journey Context & Memory

**Status:** Implementation-ready  
**Priority:** P0  
**Parent architecture:** `Core_Experience_v2_Canonical.md`  
**Execution plan:** `Core_Experience_v2_Implementation_Milestones.md`  
**Prerequisite:** M1 Narrative Engine v2 merged in `main`

---

## 1. Goal

Milestone 2 makes Hey City understand the **journey so far**, not only the current POI.

The system must be able to answer deterministic product questions such as:

- what objects were already discussed in this session;
- what topics have recently appeared;
- what story was completed, skipped or abandoned;
- whether a callback is valid;
- whether a candidate/story would be repetitive;
- what movement/area context is currently known;
- what evidence/facts have already been used;
- what happened after a system decision.

The output of M2 is **structured context and memory** that can influence StoryBrief construction and narrative continuity.

M2 does **not** implement open-ended user conversation, microphone interruption, realtime voice, nearby-search dialogue, or navigation dialogue. Those belong to M3/M4.

---

## 2. Existing architecture to preserve

Current M1 path:

```text
approved Discovery target
  -> EvidenceBundle
  -> StoryBrief
  -> authoritative NarrativePlan
  -> NarrativeGenerator
  -> AITaskRouter(final_storytelling)
  -> GenerativeProvider
  -> TTS
```

Existing state/persistence:

- `DriveSession` owns active session state.
- `history_items` stores user history when history is enabled.
- `usage_events` stores product/provider telemetry.
- `wasPoiListenedRecently()` already provides coarse anti-repeat behavior.
- M1 `storyContinuation` provides same-POI short -> detailed continuity.
- `AheadDiscoveryDiagnostic` exposes current movement/candidates.
- `StoryBrief` and evidence remain server-internal.

M2 must **extend these boundaries**, not create a second independent memory/database subsystem.

---

## 3. Architectural decisions

### 3.1 One journey state owner per active session

Each active `DriveSession` owns one server-internal `JourneyState`.

```text
DriveSession
  └── journeyState
        ├── movement snapshot
        ├── area context
        ├── recent moments
        ├── recent entities/topics
        ├── used evidence refs
        ├── outcomes
        ├── callback candidates
        └── recent questions placeholder
```

Do not keep a competing journey state in UI components or in the LLM.

### 3.2 Session continuity vs persisted history

Separate them explicitly.

**Session memory**
- always available while the current session exists;
- required for correct product behavior;
- removed when session ends;
- works for guests.

**Persistent history**
- written only when the user's history setting allows it;
- used to initialize coarse anti-repeat/recent-history context for signed-in users;
- must not be required for correct operation of a single active session.

Disabling history must prevent persistence, not break current-session continuity.

### 3.3 Deterministic memory

Journey Memory stores structured facts/events.

The LLM must not decide:
- whether an event happened;
- whether a story was completed/skipped;
- which entity was discussed;
- whether a callback source actually exists;
- whether evidence was already used.

LLM receives only validated journey context selected by product logic.

### 3.4 No new paid location provider in M2

M2 must not add a new Google Geocoding/Places call solely to infer neighborhood.

Area context should use already-available signals first:
- city/town/locality/region candidates;
- selected target metadata;
- existing local seed metadata;
- injected/test area resolver.

Create an abstraction if needed, but do not add a billable provider call in this milestone.

---

## 4. Required contracts

Exact filenames may be adjusted after audit. Semantics may not be weakened.

### 4.1 JourneyContext

Server-internal canonical snapshot supplied to planning.

```ts
interface JourneyContext {
  sessionId: string;

  movement: {
    mode: 'walking' | 'vehicle';
    latitude: number;
    longitude: number;
    headingDegrees?: number;
    speedKmh?: number;
    observedAt: string;
  };

  area: {
    city?: string;
    locality?: string;
    neighborhood?: string;
    region?: string;
    areaType?: string;
    source: 'discovery' | 'local' | 'unknown';
  };

  current: {
    targetId?: string;
    targetName?: string;
    activeStoryLevel?: 'auto' | 'short' | 'long';
  };

  recent: {
    entities: JourneyEntityMemory[];
    topics: JourneyTopicMemory[];
    outcomes: JourneyOutcomeMemory[];
    questions: JourneyQuestionMemory[];
    narrativeSignatures: string[];
  };

  callbacks: JourneyCallback[];

  usedEvidenceRefs: string[];
}
```

This object is not a public mobile DTO.

### 4.2 JourneyEntityMemory

```ts
interface JourneyEntityMemory {
  entityId: string;
  name: string;
  category?: string;
  firstSeenAt: string;
  lastDiscussedAt: string;
  discussionCount: number;
  storyLevels: Array<'auto' | 'short' | 'long'>;
  evidenceRefs: string[];
  topics: string[];
  outcome?: 'completed' | 'skipped' | 'paused' | 'superseded';
}
```

### 4.3 JourneyTopicMemory

Topics are deterministic product tags, not free-form model summaries.

Allowed sources include:
- `themeTags`;
- normalized target category;
- explicit deterministic narrative angle key;
- future validated conversation intent tags.

```ts
interface JourneyTopicMemory {
  key: string;
  firstAt: string;
  lastAt: string;
  mentions: number;
  entityIds: string[];
}
```

### 4.4 JourneyOutcomeMemory

```ts
interface JourneyOutcomeMemory {
  momentId: string;
  entityId?: string;
  startedAt: string;
  endedAt?: string;
  reason?: 'completed' | 'skipped' | 'paused' | 'superseded';
  level?: 'auto' | 'short' | 'long';
  listenedSeconds?: number;
}
```

### 4.5 JourneyQuestionMemory

M2 defines the storage contract but does not add conversation UI.

```ts
interface JourneyQuestionMemory {
  at: string;
  intent?: string;
  subjectId?: string;
  normalizedTopic?: string;
}
```

Provide an internal helper/API for M3 to call later. Do not invent user questions from narration.

### 4.6 JourneyCallback

A callback is valid only if it references a real prior memory entry.

```ts
interface JourneyCallback {
  id: string;
  sourceEntityId: string;
  sourceEntityName: string;
  sourceMomentId: string;
  topicKey: string;
  relationship: 'callback' | 'contrast' | 'continuation' | 'transition';
  evidenceRefs: string[];
  createdAt: string;
}
```

Never store a fabricated callback sentence as the source of truth.

### 4.7 ExperienceDecisionEvent

Implement the canonical telemetry concept with bounded data.

```ts
interface ExperienceDecisionEvent {
  sessionId: string;
  at: string;

  context: {
    movementMode: 'walking' | 'vehicle';
    locationBucket: string;
    headingBucket?: number;
    speedBucket?: string;
    areaType?: string;
    candidateDensity: number;
  };

  candidates: Array<{
    id: string;
    targetType?: string;
    distanceBucket?: string;
    score?: number;
    excludedReason?: string;
  }>;

  decision: {
    type: 'hold' | 'trigger_story';
    selectedTargetId?: string;
    triggerReason?: string;
    holdReason?: string;
    momentRelationship?: string;
  };

  outcome?: {
    completed?: boolean;
    skipped?: boolean;
    paused?: boolean;
    superseded?: boolean;
    askedMore?: boolean;
    askedQuestion?: boolean;
    listenedSeconds?: number;
  };
}
```

Privacy rule:
- no raw GPS coordinates in persisted experience telemetry;
- use coarse location buckets;
- do not persist raw transcripts in telemetry.

---

## 5. JourneyState service

Create one server-owned boundary, suggested:

`server/src/services/journeyContext.ts`

Responsibilities:

1. initialize session JourneyState;
2. update movement snapshot from session pings;
3. update area context from existing signals;
4. record started story moments;
5. record successful narration;
6. record finish/skip/pause/supersede outcomes;
7. record used evidence refs;
8. record deterministic topic tags;
9. build validated callback candidates;
10. expose a bounded `JourneyContext` snapshot to StoryBrief planning;
11. expose an internal question-recording helper for M3;
12. keep bounded memory.

It must not:
- choose a POI;
- modify Discovery score;
- call an LLM;
- create unsupported historical claims;
- create a new external location lookup.

---

## 6. Bounded-memory policy

Do not allow session state to grow without limit.

Configurable defaults, for example:

- recent entities: 20;
- recent topics: 12;
- recent outcomes: 20;
- recent questions: 10;
- callbacks: 8;
- used evidence refs: 100;
- narrative signatures: 12.

Put limits/TTLs in config.

Old entries are evicted deterministically by recency.

---

## 7. Area context

M2 needs a useful area context without expanding Maps cost.

### Initial resolver priority

1. current included discovery candidates of type `city`, `town`, `locality`, `region`;
2. current selected target/local seed metadata when available;
3. previous still-valid session area;
4. unknown.

If multiple area candidates exist:
- choose deterministically by specificity then distance;
- do not use LLM ranking.

### Expiration

Area context must expire/update after meaningful movement or provider refresh.

Do not allow "Manhattan" or another locality to persist indefinitely after the user has moved elsewhere.

---

## 8. Story planning integration

M2 extends M1 StoryBrief.

Suggested additions:

```ts
interface StoryBrief {
  ...
  journey: {
    area?: {
      city?: string;
      locality?: string;
      neighborhood?: string;
    };

    recentEntityRefs: string[];
    recentTopicKeys: string[];
    usedEvidenceRefs: string[];
    callback?: JourneyCallback;
    recentNarrativeSignatures: string[];
  };
}
```

Do not expose the full JourneyContext to the model if a smaller subset is sufficient.

### NarrativePlan / MomentPlan

Extend `MomentPlan` additively with:

```ts
priorContextRefs?: string[];
```

If a valid callback is selected:

```text
moment.relationship = callback | contrast | transition
priorContextRefs = [validated prior moment/entity refs]
```

The NarrativePlan contains references/intent, not raw user history.

---

## 9. Callback policy

Callbacks are deterministic opportunities, not mandatory decorations.

A callback may be offered when:

- there is a real prior entity/moment in this session;
- prior moment outcome is not superseded before delivery;
- there is a shared deterministic topic/category/relationship;
- it is not the immediately repeated same statement;
- callback has not been used too recently;
- current story has sufficient evidence.

Examples:

```text
Wall Street theme -> Federal Hall
architecture transition -> adjacent building
bridge engineering -> another infrastructure object
```

Do not force a callback into every story.

### Callback generation

Product logic chooses the callback source and relationship.

LLM may formulate the callback sentence but must receive:
- source entity name;
- validated topic key;
- allowed relationship;
- relevant evidence refs.

It may not invent "remember when we discussed X" unless X exists in JourneyContext.

---

## 10. Repetition protection

M2 must improve beyond coarse `wasPoiListenedRecently()`.

Required layers:

### 10.1 Entity repetition

Within session:
- do not auto-trigger the same entity repeatedly unless a valid continuation/user action requires it.

Across persisted history:
- retain existing cooldown behavior.

### 10.2 Evidence repetition

Track evidence refs used in completed/played stories.

When revisiting the same entity:
- prefer unused evidence;
- if no meaningful unused evidence remains, hold/no new automatic story.

### 10.3 Topic repetition

Do not produce many consecutive stories with the same topic/angle when other valid angles exist.

M2 may use a deterministic penalty/rotation in **narrative planning only**.

It must not alter Discovery target selection/ranking.

### 10.4 Narrative-shape repetition

Record a small narrative signature, e.g.:

```text
guide + relationship + intent + beatKinds
```

StoryBriefBuilder should avoid reusing the same opening/beat signature repeatedly when an equivalent permitted variant exists.

No extra LLM call is allowed solely for variation.

---

## 11. Persistent history integration

Use existing `history_items`.

Do not add a new persistence database unless existing schema cannot represent required data.

Recommended:

- keep `poi_listened` as existing compatibility type;
- store M2 structured fields in `metadata`:
  - momentId;
  - storyLevel;
  - outcome;
  - topicKeys;
  - evidenceRefs;
  - guideId;
  - area summary;
- optionally introduce narrowly scoped history types only if tests/UI remain backward compatible.

### Privacy/history setting

If `historyEnabled === false`:
- do not persist journey memory/history items;
- still maintain in-memory session JourneyState;
- telemetry must follow existing privacy/retention policy.

Guests:
- session memory only unless existing guest persistence policy explicitly allows more.

---

## 12. Story lifecycle instrumentation

Current `finishActiveStory()` is not sufficient to reconstruct outcomes.

M2 must associate an active story moment with:
- moment ID;
- POI/entity ID;
- level;
- start timestamp;
- evidence refs;
- topic keys;
- guide;
- area context.

When story finishes:
- `ended` -> completed;
- `skipped` -> skipped;
- `paused` -> paused.

When another selection supersedes an unfinished request/story:
- record superseded where applicable.

Do not mark a story completed merely because text/TTS generation succeeded.

---

## 13. Experience telemetry

Persist bounded, privacy-safe experience events through the existing telemetry boundary.

Preferred implementation:
- `usage_events` with category `product`;
- operations such as:
  - `experience_decision`;
  - `story_started`;
  - `story_outcome`;
  - `callback_used`.

Metadata must be structured and bounded.

Do not store:
- raw exact GPS;
- full narration transcript;
- full Wikipedia source text;
- secrets.

---

## 14. M2 does not implement user conversation

The canonical M2 scope mentions recent user questions because Journey Memory must be ready for M3.

For M2:

- define `JourneyQuestionMemory`;
- expose an internal `recordJourneyQuestion()` helper;
- unit-test it;
- leave it unused by production UI until M3.

Do not add:
- chat textbox;
- microphone interaction;
- LLM intent classifier;
- NearbySearch conversation flow;
- resume-after-question runtime.

Those are M3.

---

## 15. Expected files

Work must audit first.

Likely existing changes:

- `server/src/services/driveSession.ts`
- `server/src/services/selectedStory.ts`
- `server/src/services/storyBrief.ts`
- `server/src/services/narrativePlan.ts`
- `server/src/services/history.ts`
- `server/src/services/usage.ts`
- `server/src/services/driveDecision.ts` only if necessary for session anti-repeat input, not ranking
- `server/src/config.ts`
- `shared/src/contracts/drive.d.ts` only for safe additive public/shared refs
- `docs/architecture/05-narrative-plan-flow.md`
- relevant architecture docs

Suggested new files:

- `server/src/services/journeyContext.ts`
- `server/test/journeyContext.test.ts`
- `server/test/journeyReplay.test.ts`
- `evaluation/golden/journey-v2.json` or equivalent

Do not introduce a new state-management package.

---

## 16. Mandatory automated tests

### T1 — Session memory initializes empty

New session has:
- no recent entities;
- no callbacks;
- no used evidence;
- current movement/area only after context arrives.

### T2 — Movement context updates

Context ping updates mode/location bucket/heading/speed snapshot without persisting raw GPS telemetry.

### T3 — Story start is not completion

Generating or starting a story does not mark it completed.

### T4 — Finish outcome

`ended`, `skipped`, and `paused` map to the correct JourneyOutcome.

### T5 — Supersede safety

An aborted/superseded story cannot later write a completed outcome or valid callback.

### T6 — Entity memory

Successful story records:
- entity;
- story level;
- guide;
- topics;
- evidence refs.

### T7 — Evidence anti-repeat

A revisit does not automatically reuse all already-consumed evidence.

If no meaningful unused evidence remains, automatic narration is suppressed/held at planning level without changing Discovery ranking.

### T8 — Callback validity

A callback references a real prior moment/entity and a deterministic shared topic.

### T9 — No phantom callback

With no prior matching event, callback list is empty and generator is never told "remember".

### T10 — Callback outcome integrity

Skipped/superseded content must not become a callback claiming the user heard it.

### T11 — Area context

Area context is derived deterministically from available area candidates, updates when context changes and expires when stale.

### T12 — History disabled

With `historyEnabled=false`:
- current session continuity works;
- no persistent `history_items` journey write occurs.

### T13 — Guest behavior

Guest session memory works without DB persistence requirement.

### T14 — Session end cleanup

Session-owned JourneyState is released on session stop.

### T15 — Bounded memory

High-volume replay never exceeds configured caps.

### T16 — Telemetry privacy

Persisted decision/outcome telemetry has:
- coarse location bucket;
- no exact latitude/longitude;
- no transcript/source text.

### T17 — M1 continuation preserved

Short -> detailed behavior from M1 still passes and now integrates with used evidence memory.

### T18 — Provider/cost regression

M2 adds zero new LLM calls and zero new external Maps calls to the normal story pipeline.

---

## 17. Replay acceptance scenarios

Create a deterministic multi-step replay covering at least 15–20 simulated minutes.

### R1 — Multi-object Financial District journey

Example sequence:

1. Wall Street / financial-history object
2. Federal Hall
3. nearby architecture object
4. another history object
5. revisit prior area/object

Expected:
- no mechanical repeat;
- Federal Hall can make a valid callback/contrast to prior financial/political context if deterministic topic relation exists;
- a later story does not falsely claim an unheard/skipped story was discussed.

### R2 — Skip then later callback candidate

User skips a story.

Expected:
- skip outcome recorded;
- no callback that says "earlier we talked about..." based on skipped content.

### R3 — Short then detailed

Expected:
- M1 continuation still works;
- used evidence refs are merged correctly;
- later revisit avoids repeating both segments.

### R4 — Area transition

Replay crosses from one area context to another.

Expected:
- stale previous area expires;
- StoryBrief uses the current area;
- no invented neighborhood if source is unknown.

### R5 — History disabled

Expected:
- continuity during session;
- no durable user-history write.

---

## 18. Golden Journey fixture

Machine-readable replay should encode:

- context events;
- candidate/selection events;
- story generated/started;
- finish reason;
- expected JourneyContext after each step;
- allowed callbacks;
- forbidden callbacks;
- expected used evidence refs;
- expected area context;
- expected persisted vs session-only events.

Do not assert exact LLM prose.

---

## 19. Performance and cost

M2 should be computationally cheap.

Targets:
- JourneyContext snapshot/build: sub-millisecond to low single-digit milliseconds locally;
- no additional LLM request for memory/callback selection;
- no additional Google/Maps request for area context;
- bounded DB/history writes;
- no full-history scan on every GPS ping.

Important:
current `wasPoiListenedRecently()` loads full history. If M2 materially increases history queries, optimize with a bounded/query-specific path rather than repeatedly scanning all history.

Report:
- memory/context build time;
- added DB calls per session/story;
- added LLM calls: expected 0;
- added Maps/provider calls: expected 0;
- memory growth under long replay.

---

## 20. Definition of Done

### Architecture

PASS only if:
- one session-owned JourneyState exists;
- no journey authority moves into LLM;
- no parallel database/state subsystem is introduced without need;
- M1 NarrativePlan/provider boundaries remain intact;
- M3 conversation scope is not pulled forward.

### Product behavior

PASS only if:
- 15–20 minute replay does not mechanically repeat entities/facts;
- at least one valid callback occurs;
- invalid/phantom callbacks never occur;
- skipped/superseded content is not treated as heard;
- area context affects StoryBrief when known;
- area remains absent rather than invented when unknown;
- M1 short -> detailed still works.

### Privacy/cost

PASS only if:
- history preference is respected;
- exact GPS/transcripts are not persisted in M2 telemetry;
- no new LLM call is added;
- no new Maps/provider call is added solely for M2.

### Regression

PASS only if:
- shared/server typecheck passes;
- full server suite passes;
- M1 suite passes;
- applicable mobile/web suites pass;
- production Docker build passes in CI.

### Reporting

PR must contain:
1. changed files;
2. JourneyContext contract;
3. persistence policy;
4. replay results;
5. callback examples and rejected phantom callback example;
6. history-disabled result;
7. telemetry/privacy check;
8. latency/DB-call impact;
9. LLM/Maps call delta;
10. explicit PASS/FAIL per acceptance criterion.

---

## 21. Stop conditions

Work must stop and report instead of improvising if:

- satisfying M2 appears to require changing Discovery target ranking;
- neighborhood context requires a new paid provider call;
- user-question handling requires implementing M3;
- a second memory database seems necessary;
- existing history/privacy semantics conflict with this specification.

Do not silently expand scope.

---

## 22. Work Mode execution instruction

> Implement **Core Experience v2 — Milestone 2: Journey Context & Memory** according to
> `docs/context/Core_Experience_v2_M2_Journey_Context_Memory_Implementation_Spec.md`.
>
> M1 is already merged. Do not reopen or redesign M1 except for compatibility changes strictly required by M2.
>
> Audit `DriveSession`, `history.ts`, M1 StoryBrief/NarrativePlan, replay tests, and privacy/history behavior before editing.
>
> Build one session-owned JourneyState and integrate with existing `history_items` / `usage_events`; do not create a parallel memory system.
>
> Preserve deterministic Discovery and all M1 provider boundaries. Do not add an LLM call or a paid Maps/geocoding call for memory/context.
>
> Do not implement Conversation Runtime, realtime voice, or unrelated UI.
>
> Work in a separate branch and open a Draft PR. Do not merge it.
>
> Use checkpoint commits after coherent phases. Run all required tests/replays and report failures honestly.
