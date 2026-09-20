# Hey City — Core Experience v2 Implementation Milestones

**Status:** Canonical execution plan  
**Parent:** `Core_Experience_v2_Canonical.md`

## Execution rule

Implement one vertical milestone at a time.

Do not start the next milestone until the current milestone passes its release gate.

Every milestone must be developed in a separate branch/PR and validated against its acceptance criteria.

```text
Specification
  -> implementation PR
  -> automated tests
  -> replay/experience QA
  -> architecture review
  -> PASS
  -> merge
```

## Milestone 1 — Narrative Engine v2

### Goal

Remove the "spoken Wikipedia" experience while preserving deterministic product decisions.

### Required scope

Audit existing contracts first. Reuse/extend rather than duplicate.

Implement or extend:

- `MomentPlan`;
- `StoryBrief`;
- `NarrativeBeat`;
- `GuidePolicy`;
- evidence normalization/gating;
- Dana runtime narrative policy;
- Artur runtime narrative policy;
- Golden Corpus;
- NarrativePlan integration;
- short -> detailed continuation behavior.

### Must not change

- POI ownership/ranking authority;
- safety authority;
- movement/trigger decisions;
- provider-independent routing;
- unrelated UI.

### Acceptance

- Dana and Artur are materially different on the same facts.
- No generic encyclopedia opening dominates narration.
- Deep story is unavailable when evidence is insufficient.
- Detailed story continues rather than repeating short story.
- Unsupported facts are not introduced.
- Existing provider abstraction remains intact.
- Mandatory weak-POI scenario passes.

### Release gate

If storytelling still feels like a rewritten reference article, Milestone 1 fails even if technical tests pass.

---

## Milestone 2 — Journey Context & Memory

### Goal

Make the guide understand the journey rather than only the current POI.

### Required scope

Implement/extend structured state for:

- recent entities;
- recent topics;
- completed/skipped stories;
- user questions;
- callbacks;
- neighborhood context;
- movement context;
- repetition protection;
- experience decision/outcome telemetry.

### Acceptance

After a 15-20 minute replay:

- previously covered facts are not mechanically repeated;
- the guide can make a valid callback;
- transitions between nearby subjects are coherent;
- current neighborhood/context influences narration;
- callbacks never reference events that did not happen.

---

## Milestone 3 — Conversation Runtime

### Goal

Turn narration into interruptible contextual dialogue.

### Required state behavior

```text
NARRATING
 -> user interruption
 -> LISTENING
 -> INTENT
 -> TOOL / ANSWER
 -> RESPONDING
 -> RESUME_DECISION
 -> NARRATING or IDLE
```

### Initial intents

- current story question;
- visible-object question;
- nearby search;
- recommendation;
- navigation;
- deeper story;
- repeat;
- stop;
- resume;
- change topic;
- general contextual question.

### Initial tools

- NearbySearch;
- PlaceDetails;
- CurrentTarget;
- CurrentArea;
- JourneyRecall;
- StoryEvidence;
- MapHighlight;
- NavigationHandoff.

### Acceptance

During narration the user asks where to get coffee.

The system must:

1. stop/duck current narration immediately;
2. preserve story state;
3. resolve nearby coffee from current context;
4. answer in guide voice;
5. make the place available to the map;
6. correctly resume or abandon the previous story.

There must be no separate disconnected "chatbot mode".

---

## Milestone 4 — Realtime Voice

### Goal

Make interruptions and dialogue feel natural while keeping voice-provider architecture replaceable and cost-controlled.

### Required scope

Implement/confirm:

- `SpeechProvider`;
- `RealtimeConversationProvider`;
- realtime-session lifecycle;
- interruption handling;
- tool-call bridge;
- latency/cost telemetry.

Benchmark at least two viable realtime providers using identical scripts.

### Measure

- interruption latency;
- first response latency;
- naturalness;
- persona preservation;
- noise handling;
- tool reliability;
- cost/minute.

### MVP rule

Normal narration may continue to use quality TTS.

Realtime voice is opened for active conversation and closed after an inactivity window.

Do not require always-on realtime voice for this milestone.

---

## Milestone 5 — Experience Evaluation & Release Gate

### Goal

Make Core Experience quality measurable and regression-resistant.

### Mandatory replay scenarios

- WTC / Ground Zero;
- Golden Gate Bridge;
- Art Institute of Chicago;
- weak POI;
- coffee interruption;
- contextual follow-up;
- Dana vs Artur;
- multi-object journey with callback/repetition checks.

### Required measurements

- selected target;
- selection reason;
- story availability;
- target relevance;
- factual grounding;
- persona consistency;
- repetition;
- story latency;
- interruption latency;
- model/TTS usage;
- estimated variable cost per 30-minute session.

### Release gate

Core Experience v2 is not production-ready until the replay suite passes both:

1. deterministic/technical checks;
2. experience-quality checks.

---

## Definition of Done for every milestone

A milestone is complete only when the PR contains:

1. changed files;
2. architecture notes;
3. test results;
4. applicable replay results;
5. known failures/risks;
6. latency impact;
7. variable-cost impact;
8. explicit PASS/FAIL against every acceptance criterion.

"Code compiles" or "endpoint responds" is not sufficient.

## Work Mode task rule

Do not give Work vague requests such as "improve storytelling".

Each Work task must point to the canonical milestone specification and say:

- implement only this milestone;
- preserve canonical architecture boundaries;
- inspect existing contracts before adding new ones;
- do not silently expand scope;
- create a branch/PR;
- run all applicable acceptance/replay tests;
- return failures rather than hiding them.
