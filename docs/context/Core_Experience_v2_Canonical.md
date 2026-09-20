# Hey City — Core Experience v2 (Canonical)

**Status:** Canonical product/experience architecture  
**Priority:** P0  
**Working concept:** **Conversation with the City**  
**Scope:** narrative quality, journey continuity, conversation runtime, guide behavior, voice interaction, experience evaluation

## 1. Purpose

Hey City is not a POI reader and not an audio Wikipedia.

The target experience is a continuous conversation with a city-aware companion that understands:

- where the user is;
- how the user is moving;
- which objects and areas are relevant now;
- what has already been discussed;
- what the user asks about;
- when to speak;
- when silence is more valuable than another story.

The Guide is the primary conversational interface to the city.

## 2. Relationship to existing canonical architecture

This document **extends** the existing canonical architecture. It does not replace deterministic Discovery, safety, timing, or provider abstraction.

The following remain authoritative:

- Brain/services make product decisions.
- LLMs generate language; they do not choose POIs, timing, safety policy, ranking, route behavior, or budgets.
- `NarrativePlan` remains an authoritative boundary.
- Mapping, narrative planning, language generation, conversation, TTS, and provider routing remain separate concerns.
- Vehicle mode remains audio-first and safety-constrained.

If this document conflicts with older narrative UX assumptions, this document supersedes them **only for the Core Experience v2 interaction and narrative model**. Discovery, safety, and deterministic orchestration rules remain unchanged unless explicitly revised in a separate canonical decision.

## 3. Current problem

The effective current flow is approximately:

```text
POI candidates
  -> ranking
  -> selected POI
  -> NarrativePlan
  -> one generated narration
  -> TTS
```

This can be technically correct while still feeling like an encyclopedia.

The missing layer is not simply a better prompt or a better TTS voice. The system needs structured understanding of the **current conversational moment** and the **journey so far**.

## 4. Target architecture

```text
Real-world context
(location / heading / speed / route / time)
        |
        v
Context Engine
        |
        v
Discovery / Guide Brain
        |
   SILENCE or approved MOMENT
        |
        v
Conversational Director
        |
        v
MomentPlan
        |
        +------------------+
        |                  |
        v                  v
Evidence / Knowledge   Journey Context
        |                  |
        +--------+---------+
                 |
                 v
             StoryBrief
                 |
                 v
           NarrativePlan
                 |
                 v
        Narrative Generator
                 |
                 v
        Conversation Runtime
          /             \
         v               v
      Speech/TTS     Realtime Dialogue
         \               /
          +------User----+
```

## 5. Ownership boundaries

### 5.1 Discovery / Guide Brain

Deterministically answers:

> Is this worth the user's attention now?

It owns:

- candidate selection;
- relevance/ranking;
- distance/ETA/heading logic;
- cooldown;
- interruption cost;
- safety policy;
- speak vs silence.

Conceptual policy:

```text
ExpectedMomentValue =
  spatialRelevance
  x contextualInterest
  x narrativeNovelty
  x journeyContinuity
  x temporalOpportunity
  x userAffinity
  x confidence
  - interruptionCost
```

This is a product concept, not a required literal formula.

### 5.2 Conversational Director

Receives an already-approved moment.

It does **not** decide whether a POI should be selected.

It answers:

> What conversational role should this approved moment play?

Example roles:

- new topic;
- continuation;
- callback;
- contrast;
- transition;
- orientation;
- answer;
- recommendation.

Example intents:

- notice;
- orient;
- surprise;
- explain;
- connect;
- reflect;
- recommend.

### 5.3 Narrative Planner

Builds structured narrative intent and evidence into a `StoryBrief` and authoritative `NarrativePlan`.

### 5.4 LLM / GenerativeProvider

Answers only:

> How should the approved plan be expressed naturally in the selected guide's voice?

It must not:

- substitute another POI;
- invent unsupported facts;
- change product timing;
- bypass safety;
- make ranking decisions;
- directly control map/navigation behavior.

## 6. Core contracts

Exact names/enums may be adjusted during implementation if equivalent contracts already exist. Do not create duplicates without first auditing existing types.

### 6.1 JourneyContext

```ts
interface JourneyContext {
  sessionId: string;

  movement: {
    mode: "walking" | "driving" | "stationary";
    location: GeoPoint;
    heading?: number;
    speed?: number;
    route?: RouteContext;
  };

  area: {
    neighborhood?: string;
    city?: string;
    areaType?: string;
    density?: "low" | "medium" | "high";
  };

  conversation: {
    currentTopic?: string;
    currentTargetId?: string;
    userIntent?: string;
  };

  history: {
    recentlyDiscussedEntityIds: string[];
    recentlyDiscussedTopics: string[];
    callbacksAvailable: JourneyCallback[];
  };

  inferredPreferences: {
    themes: WeightedTheme[];
    dislikedThemes: WeightedTheme[];
  };
}
```

This is structured session state, not free-form LLM memory.

### 6.2 MomentPlan

```ts
interface MomentPlan {
  targetId?: string;

  relationship:
    | "new_topic"
    | "continuation"
    | "callback"
    | "contrast"
    | "transition"
    | "orientation"
    | "answer"
    | "recommendation";

  intent:
    | "notice"
    | "orient"
    | "surprise"
    | "explain"
    | "connect"
    | "reflect"
    | "recommend";

  delivery:
    | "micro"
    | "observation"
    | "brief_story"
    | "deep_story";

  priorContextRefs: string[];

  attentionCue?: {
    relativeDirection?: "ahead" | "left" | "right";
    visualReference?: string;
  };
}
```

### 6.3 EvidenceItem

```ts
interface EvidenceItem {
  id: string;
  claim: string;
  sourceType: string;
  sourceRef?: string;
  confidence: number;
  temporalRelevance?: string;
}
```

Wikipedia, Google Places, and other sources are evidence providers. Their page structure must never become the narration structure.

### 6.4 StoryBrief

```ts
interface StoryBrief {
  subject: EntityRef;
  moment: MomentPlan;

  userContext: {
    movementMode: string;
    currentArea?: string;
    relevantPriorTopics: string[];
  };

  narrativeAngle: string;
  humanAngle?: string;
  beats: NarrativeBeat[];
  evidence: EvidenceItem[];
  guidePolicy: GuidePolicyRef;

  constraints: {
    targetSeconds: number;
    language: string;
    forbiddenPatterns: string[];
  };
}
```

### 6.5 Narrative beats

Prefer composing spoken beats over generating one essay.

Typical beats:

- attention;
- hook;
- reveal;
- context;
- human detail;
- contrast;
- callback;
- transition;
- stop.

Not every story needs every beat.

## 7. Evidence gate

If evidence is insufficient:

- do not fabricate;
- do not offer a deep/full story;
- do not expose short/full controls that imply content exists.

A name alone is insufficient.

At minimum the system must know the category before mentioning an object as a discovery.

A weak POI may be converted into a broader contextual topic only when deterministic product rules explicitly allow it and relevant evidence exists.

## 8. Guide personas

Dana and Artur are not the same text with different voices.

Guide behavior must affect:

- selection of narrative angle;
- sentence rhythm;
- directness;
- humor;
- curiosity;
- emotional range;
- transitions;
- callbacks;
- how questions are asked or avoided.

### Dana

- contemporary;
- curious;
- conversational;
- lightly playful;
- short spoken sentences;
- good at past/present connections;
- avoids lecture tone and artificial enthusiasm.

### Artur

- calm;
- observant;
- precise;
- more restrained;
- slightly more historical/contextual;
- avoids theatrical dramatization.

Persona differences must never change factual evidence.

## 9. Golden Corpus

Create a regression corpus under an implementation-appropriate path such as:

```text
evaluation/golden/
  dana/
  artur/
```

It must contain manually accepted examples for:

- major landmark;
- obscure building;
- neighborhood;
- person;
- historical event;
- architecture;
- weak POI;
- callback;
- transition;
- recommendation;
- follow-up;
- interruption.

Prompt/model/provider changes are evaluated against this corpus.

## 10. Conversation Runtime

Narration and conversation are one Guide Session.

Required conceptual state machine:

```text
IDLE
 -> NARRATING
 -> LISTENING
 -> UNDERSTANDING
 -> TOOL_EXECUTION or RESPONDING
 -> RESUME_DECISION
 -> NARRATING or IDLE
```

The user must be able to interrupt narration at any point.

Initial intent classes:

- ask_about_current_story;
- ask_about_visible_object;
- ask_about_area;
- nearby_search;
- navigation_request;
- recommendation_request;
- repeat;
- go_deeper;
- stop_story;
- resume_story;
- change_topic;
- general_question.

The LLM may classify ambiguous language, but actions must be validated against allowed product intents/tools.

## 11. Conversation tools

Initial product tool layer:

- NearbySearch;
- PlaceDetails;
- RouteEstimate;
- CurrentArea;
- CurrentTarget;
- JourneyRecall;
- StoryEvidence;
- MapHighlight;
- NavigationHandoff.

Correct pattern:

```text
conversation model
 -> structured tool intent
 -> Hey City tool
 -> validated structured result
 -> conversational response
```

The voice/realtime provider must not become the business-logic layer.

## 12. Journey Memory

Journey Memory is structured and has two purposes.

### 12.1 Experience continuity

Track:

- discussed entities;
- topics;
- completed/skipped stories;
- user questions;
- callbacks;
- recent story structures;
- relevant preferences.

### 12.2 Experience telemetry

Track why the system spoke and what happened afterward.

Example:

```ts
interface ExperienceDecisionEvent {
  context: {
    locationBucket: string;
    heading?: number;
    speed?: number;
    movementMode: string;
    areaType?: string;
    candidateDensity: number;
  };

  candidates: CandidateSnapshot[];

  decision: {
    selectedTarget?: string;
    score?: number;
    triggerReason: string;
    momentType?: string;
  };

  outcome?: {
    listenedSeconds?: number;
    completed?: boolean;
    skipped?: boolean;
    interrupted?: boolean;
    askedMore?: boolean;
    askedQuestion?: boolean;
    saved?: boolean;
  };
}
```

This telemetry becomes the basis for future relevance learning.

## 13. Voice architecture

Voice remains provider-independent.

```ts
interface SpeechProvider {
  synthesize(request: SpeechRequest): Promise<SpeechResult>;
}

interface RealtimeConversationProvider {
  startSession(config: RealtimeSessionConfig): RealtimeSession;
}
```

Recommended MVP operating model:

```text
normal narration
 -> quality TTS

user starts speaking
 -> realtime conversation session

conversation becomes idle
 -> close realtime session
 -> return to narration mode
```

Do not require continuous expensive realtime sessions for the initial MVP.

Provider selection must be benchmark-driven rather than reputation-driven.

## 14. Latency model

Do not wait for one giant synchronous pipeline.

For high-confidence approaching targets:

- prefetch evidence;
- prepare StoryBrief;
- precompute safe reusable primitives;
- optionally prepare the first beat.

Experience targets:

- trigger to first speech: preferably < 1.0-1.5 s;
- user interruption acknowledgement: preferably < 500 ms;
- simple follow-up response: preferably < 1.5 s.

These are product targets, not hard network SLAs.

## 15. Caching

Split cache responsibilities:

### Evidence cache

Highly reusable:

```text
entity -> normalized evidence
```

### Story primitive cache

Moderately reusable:

```text
entity + theme + guide -> possible angles/beats
```

### Final contextual narration

Low reuse:

```text
journey context + moment + guide -> final spoken output
```

Do not over-cache final prose.

## 16. Mandatory regression scenarios

### A. World Trade Center / Ground Zero

When physically near WTC:

- Manhattan/local targets dominate distant Brooklyn candidates;
- WTC/memorial context is recognized;
- no unrelated remote target replaces a superior local target.

### B. Golden Gate Bridge

When near the bridge:

- Golden Gate and immediate context dominate distant Oracle Park;
- major landmarks may trigger from farther away than minor POIs.

### C. Art Institute of Chicago

When at/near the museum:

- the museum appears in nearby context;
- a farther object must not silently replace it.

### D. Weak POI

With only name/category and insufficient evidence:

- brief mention may be allowed when useful;
- no short/full/deep story controls;
- no invented narrative.

### E. Interruption

Guide is mid-story. User asks: "Where can I get coffee nearby?"

Expected:

1. narration stops;
2. story state is preserved;
3. nearby search uses current context;
4. guide responds conversationally;
5. map can highlight result;
6. previous story may resume appropriately.

### F. Contextual follow-up

User asks: "Why is that important?"

Expected:

- current subject is understood without restating it;
- response uses StoryBrief + JourneyContext;
- no hallucinated evidence.

### G. Persona

Same moment/evidence for Dana and Artur:

- factual core remains consistent;
- narrative structure and spoken style are materially different.

## 17. Experience Evaluation Harness

Core Experience changes are not released based only on endpoint/unit-test success.

Track at minimum:

- target relevance;
- wrong-target rate;
- story availability correctness;
- persona consistency;
- encyclopedia-tone regressions;
- callback coherence;
- interruption handling;
- follow-up grounding;
- voice latency;
- story latency;
- repetition;
- factual grounding;
- direction accuracy;
- variable cost per session.

## 18. Definition of Done

Core Experience v2 is complete only when all three categories pass.

### Architecture

- no product authority leaked into LLM;
- providers remain replaceable;
- deterministic Discovery is preserved;
- NarrativePlan remains authoritative;
- no duplicate competing contracts are introduced.

### Experience

- guide feels conversational;
- user can interrupt;
- recent context is remembered;
- neighborhood/movement context affects narration;
- tool questions work;
- guide can remain silent.

### Measurement

For replay scenarios record:

- selected target;
- selection reason;
- latency;
- story duration;
- interruption latency;
- model/TTS usage;
- estimated variable cost;
- outcome event;
- regression result.

## 19. Core invariant

For every future Core Experience decision ask:

> Would a knowledgeable local companion behave this way?

If not, technically correct output is still a product failure.

System-level objective:

> **Optimize the value of the next conversational moment, not the amount of information retrieved about nearby places.**
