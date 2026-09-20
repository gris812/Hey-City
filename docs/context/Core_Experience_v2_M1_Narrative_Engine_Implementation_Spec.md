# Core Experience v2 — Milestone 1 Implementation Specification
## Narrative Engine v2

**Status:** Implementation-ready  
**Priority:** P0  
**Parent architecture:** `Core_Experience_v2_Canonical.md`  
**Execution plan:** `Core_Experience_v2_Implementation_Milestones.md`

---

## 1. Goal

Milestone 1 removes the "spoken Wikipedia" behavior without changing the deterministic Discovery authority.

At completion, Hey City must turn verified source material into a guide-specific spoken moment with:

- a clear conversational purpose;
- a structured narrative angle;
- spoken narrative beats rather than an essay;
- different Dana/Arthur behavior;
- no unsupported facts;
- no deep-story offer when evidence is insufficient;
- real short -> detailed continuation rather than a second independent summary.

This milestone does **not** implement Journey Memory, full conversation runtime, realtime voice, or new Discovery ranking.

---

## 2. Current-code audit

The current production path is already structurally usable:

```text
Discovery
 -> NarrativePlan
 -> NarrativeGenerator
 -> AITaskRouter(final_storytelling)
 -> GenerativeProvider
 -> TTS
```

Relevant existing files:

- `shared/src/contracts/drive.d.ts`
- `server/src/services/narrativePlan.ts`
- `server/src/services/narrativeGenerator.ts`
- `server/src/services/narration.ts`
- `server/src/services/selectedStory.ts`
- `server/src/services/driveSession.ts`
- `server/src/services/discoveryKnowledge.ts`
- `server/src/services/guides.ts`
- `server/src/services/guideSeeds.json`
- `server/src/ai/aiTaskRouter.ts`
- `server/src/ai/generativeProvider.ts`
- `server/src/ai/openAiGenerativeProvider.ts`
- `server/src/services/cache.ts`
- `server/test/aiTaskRouter.test.ts`
- `server/test/progressiveSpeech.test.ts`

### 2.1 What is already correct and must be preserved

1. `AITaskRouter` owns provider routing only.
2. `final_storytelling` is already a task class.
3. `complex_follow_up` already exists for later milestones.
4. OpenAI is behind `GenerativeProvider`.
5. TTS is separate from text generation.
6. Discovery creates the authoritative target before generation.
7. Weak evidence can already reject a requested story with HTTP 422.
8. Story text and TTS already have cache boundaries.
9. Progressive speech infrastructure must remain intact.

### 2.2 Gaps to fix

#### Gap A — NarrativePlan is too weak

Current runtime plan mostly contains:

- POI name/id;
- `storySeed`;
- guide;
- theme;
- duration;
- generic structure `hook/context/fact/closing`.

It does not express why this moment is interesting or how the guide should structure it.

#### Gap B — evidence and prompt material are conflated

`discoveryKnowledge.ts` returns a raw string containing category, source URL, attribution text and encyclopedia extract.

That string is then passed as `storySeed`.

Evidence must become structured source material rather than a prose seed.

#### Gap C — generation is one-shot

`NarrativeGenerator` receives one plan and asks for one narration.

There is no explicit:

- moment intent;
- narrative angle;
- beat plan;
- continuation context;
- forbidden narrative patterns beyond prompt prose.

#### Gap D — guide behavior is underspecified

Runtime guide records contain only a short `personality` string plus voice instructions.

That is not enough to reliably produce two distinct storytellers.

#### Gap E — persona sources conflict

The repository contains several historical guide descriptions:

- `docs/context/AI_Guide_Profile_Dana_v1.md`
- `docs/context/AI_Guide_Profile_Artur_v1.md`
- `data/guides/Dana.json`
- `data/guides/Artur.json`
- runtime `server/src/services/guideSeeds.json`

The older Dana profile describes a different character concept and must not drive Core Experience v2 runtime behavior.

For Milestone 1:

- runtime narrative behavior is defined by the new `GuidePolicy`;
- `guideSeeds.json` remains the source for active guide identity/display/voice records;
- old profile documents are legacy reference only;
- no visual redesign is part of this milestone.

#### Gap F — short and long are independent generations

`selectedStory.ts` currently creates a fresh plan for each level.

A long request after a short story has no structured knowledge of what was just said.

#### Gap G — cache does not include contextual continuation identity

Current cache identity distinguishes guide/style/duration but does not include a StoryBrief/continuation fingerprint.

A contextual story must never accidentally reuse incompatible prose.

#### Gap H — tests validate plumbing, not experience contract

Current tests correctly validate provider routing, language protection and progressive speech, but do not enforce:

- story evidence gating;
- persona separation;
- banned encyclopedia openings;
- short -> long continuation;
- StoryBrief authority.

---

## 3. Architectural decision

Milestone 1 **extends** the current path.

Do not create a parallel narrative stack.

Target:

```text
approved Discovery target
        |
        v
normalized evidence
        |
        v
StoryBriefBuilder
        |
        v
StoryBrief (server-internal)
        |
        v
NarrativePlan (authoritative product contract)
        |
        v
NarrativeGenerator
        |
        v
AITaskRouter(final_storytelling)
        |
        v
GenerativeProvider
        |
        v
Story QA
        |
        v
TTS
```

### Important boundary

`StoryBrief` may contain source text and continuation transcript and therefore remains server-internal.

Do **not** serialize full raw evidence or previous transcript to the mobile client through `DrivePingResult.narrativePlan`.

---

## 4. Required contracts

Exact syntax may be adjusted to match existing TypeScript style. Semantics may not be weakened.

### 4.1 Shared NarrativePlan additions

Extend the existing shared narrative contract rather than replacing it.

Required concepts:

```ts
export type NarrativeLevel = 'auto' | 'short' | 'long';

export type MomentRelationship =
  | 'new_topic'
  | 'continuation'
  | 'callback'
  | 'contrast'
  | 'transition'
  | 'orientation';

export type NarrativeIntent =
  | 'notice'
  | 'orient'
  | 'surprise'
  | 'explain'
  | 'connect'
  | 'reflect';

export type NarrativeDelivery =
  | 'micro'
  | 'observation'
  | 'brief_story'
  | 'deep_story';

export type NarrativeBeatKind =
  | 'attention'
  | 'hook'
  | 'reveal'
  | 'context'
  | 'human'
  | 'contrast'
  | 'callback'
  | 'transition'
  | 'stop';

export interface MomentPlan {
  relationship: MomentRelationship;
  intent: NarrativeIntent;
  delivery: NarrativeDelivery;
  attentionCue?: {
    relativeDirection?: 'ahead' | 'left' | 'right';
  };
}

export interface NarrativeBeat {
  kind: NarrativeBeatKind;
  objective: string;
}

export interface NarrativePlan {
  // retain existing authoritative fields
  ...

  level: NarrativeLevel;
  moment: MomentPlan;
  narrativeAngle: string;
  beats: NarrativeBeat[];
  mustAvoid: string[];

  // source identifiers only; never raw source text
  evidenceRefs: string[];
}
```

Backward compatibility is allowed temporarily for `storySeed`, but new M1 code must not use raw `storySeed` as the primary generation contract.

### 4.2 Server-internal evidence

Create a typed normalized evidence contract, for example in a new service/module.

Required semantics:

```ts
interface EvidenceItem {
  id: string;
  claim: string;
  sourceType: 'wikipedia' | 'google' | 'curated' | string;
  sourceUrl?: string;
  confidence: number;
}

interface EvidenceBundle {
  subjectId: string;
  subjectName: string;
  category: string;
  items: EvidenceItem[];
  attribution?: {
    label: string;
    url?: string;
  };
}
```

For Wikipedia MVP evidence:

- preserve source attribution;
- strip metadata from narrative text input;
- convert the extract into stable evidence items;
- deterministic sentence segmentation is acceptable;
- do not ask the final storytelling model to parse "Category:" or "Source:" metadata from prose.

### 4.3 Server-internal StoryBrief

Required semantics:

```ts
interface StoryBrief {
  subject: {
    id: string;
    name: string;
    category: string;
  };

  moment: MomentPlan;

  level: NarrativeLevel;

  narrativeAngle: string;

  beats: NarrativeBeat[];

  evidence: EvidenceBundle;

  continuation?: {
    previousLevel: 'short';
    previousTranscript: string;
  };

  constraints: {
    targetDurationSec: number;
    language: string;
    forbiddenPatterns: string[];
  };
}
```

`StoryBrief` is planning context, not a mobile API DTO.

---

## 5. StoryBriefBuilder

Create one deterministic StoryBrief construction boundary.

Suggested file:

`server/src/services/storyBrief.ts`

Responsibilities:

1. accept the approved POI/subject;
2. accept normalized evidence;
3. accept requested level/mode/theme;
4. create `MomentPlan`;
5. select a narrative angle;
6. create beat objectives;
7. apply forbidden patterns;
8. attach continuation context when applicable;
9. return StoryBrief;
10. provide the fields needed to create the authoritative NarrativePlan.

It must **not**:

- choose a different POI;
- change Discovery ranking;
- change safety rules;
- use another location;
- invent source facts.

### 5.1 MVP deterministic angle rules

Do not introduce another model call merely to plan a story in M1.

Use simple deterministic rules from:

- target category;
- theme;
- story level;
- guide policy;
- whether this is a continuation.

This is intentionally simple. M1 validates the architecture and output behavior first.

---

## 6. GuidePolicy

Create a typed runtime narrative policy separate from TTS voice instructions.

Suggested file:

`server/src/services/guidePolicy.ts`

### 6.1 Dana

Required behavioral policy:

- contemporary;
- curious;
- conversational;
- lightly eccentric/playful, never theatrical;
- notices human/local details;
- connects past and present;
- prefers short spoken sentences;
- avoids museum-guide vocabulary;
- avoids artificial enthusiasm;
- does not invent personal history;
- does not claim to have personally visited or remembered historical events.

Preferred beat tendencies:

```text
attention -> curiosity -> reveal -> connection/contrast -> stop
```

### 6.2 Arthur

Required behavioral policy:

- calm;
- precise;
- observant;
- restrained;
- stronger historical/architectural causality;
- slightly more formal than Dana;
- no theatrical professor performance;
- no dense chronology unless necessary;
- no invented personal history.

Preferred beat tendencies:

```text
orientation/hook -> context -> precise detail -> meaning/contrast -> stop
```

### 6.3 Canonical runtime source

For M1, `GuidePolicy` is the canonical runtime storytelling behavior.

The short `Guide.personality` field may remain for display/backward compatibility but must not be the only prompt conditioning.

Do not create provider-specific policy fields.

---

## 7. NarrativePlan construction

Update `createNarrativePlan` rather than bypassing it.

It must continue to own safety/duration constraints.

After M1 it must also carry:

- level;
- moment;
- angle;
- beats;
- evidence refs;
- must-avoid rules.

The LLM still receives an authoritative plan.

The generator may not rebuild or reinterpret product decisions.

---

## 8. NarrativeGenerator v2

Update existing `NarrativeGenerator`.

Do not create a second generator.

### 8.1 Required input

It must receive:

- authoritative NarrativePlan;
- server-internal StoryBrief/evidence;
- guide policy;
- language/style;
- optional abort signal.

### 8.2 Prompt contract

The prompt must clearly separate:

1. product plan;
2. verified evidence;
3. guide style;
4. forbidden behavior.

Required generator rules:

- use only supplied evidence for factual claims;
- do not choose another POI;
- do not add route/navigation decisions;
- do not announce metadata;
- do not begin with "I will tell you about...";
- avoid generic "This historic building..." encyclopedia opening;
- do not end every story with a generic offer to tell more;
- write for speech, not reading;
- follow beat objectives;
- respect the selected guide;
- if continuation exists, continue naturally and do not restate the same opening/facts.

### 8.3 Output QA

Add deterministic post-generation validation.

At minimum reject:

- source URLs;
- "Category:", "Source:", license metadata;
- wrong-language output;
- obvious system/prompt leakage;
- empty output.

Add heuristic warnings/failures for banned openings configured by StoryBrief.

Do not attempt to fact-check externally after generation inside M1.

---

## 9. Evidence gate

Deep/short narrative availability must depend on verified evidence.

### Required behavior

#### No evidence

Do not generate a story.

#### Name + category only

Identification is allowed.

Example:

```text
"Federal Hall — историческое место рядом."
```

Do not offer a short/full story as if content exists.

#### Verified evidence exists

Short and/or detailed story may be generated.

Existing 422 behavior for an explicitly requested unavailable story must remain.

The UI/API should have enough state to avoid presenting a story action before generation/evidence availability where the current flow supports that state.

Do not redesign the whole UI in M1.

---

## 10. Short -> detailed continuation

This is a release requirement.

### Current failure

Short and long are generated independently.

### Required M1 behavior

Within the current active session, retain minimal **ephemeral story continuation state** for the selected POI.

This is **not** Journey Memory (Milestone 2).

Suggested state:

```ts
interface StoryContinuationState {
  poiId: string;
  guideId: string;
  language: string;
  previousLevel: 'short';
  previousTranscript: string;
}
```

Location may be `DriveSession` or a small session-owned helper.

Rules:

- a successful short story stores continuation state;
- requesting long for the same POI/guide/language attaches the short transcript to StoryBrief;
- long prompt must explicitly continue, not restart;
- selecting another POI invalidates or replaces the relevant active continuation;
- changing guide/language must not reuse incompatible continuation;
- session end removes it;
- direct long without prior short remains a valid standalone deeper story.

Milestone 2 will replace/extend this with Journey Memory.

---

## 11. Cache changes

The current cache must not return prose generated for a different StoryBrief context.

Add a stable contextual fingerprint containing at minimum:

- prompt version;
- guide policy version;
- POI;
- language;
- level;
- mode;
- narrative angle;
- beat kinds;
- evidence IDs/source version;
- continuation fingerprint when previous transcript exists.

Do not use full raw transcript directly in the cache key; hash it.

Static evidence should remain highly cacheable.

Final contextual prose should be cached more conservatively.

---

## 12. Persona source cleanup

### 12.1 Legacy documents

The following are legacy references and must not override Core Experience v2:

- `docs/context/AI_Guide_Profile_Dana_v1.md`
- `docs/context/AI_Guide_Profile_Artur_v1.md`

They should remain in the repository but be marked superseded for runtime narrative behavior.

### 12.2 Legacy data/guides

`data/guides/Dana.json` and `data/guides/Artur.json` are not the production runtime guide store.

Do not import them into the production narrative path merely because they contain richer prose.

If retained, document them as legacy/reference data or synchronize them later in a dedicated content cleanup.

### 12.3 Arthur ID compatibility

The runtime canonical ID is `arthur`.

Existing `artur` compatibility mapping must continue to work.

---

## 13. Files expected to change

Work must audit before editing. The expected change set is:

### Shared

- `shared/src/contracts/drive.d.ts`

### Backend existing

- `server/src/services/narrativePlan.ts`
- `server/src/services/narrativeGenerator.ts`
- `server/src/services/narration.ts`
- `server/src/services/selectedStory.ts`
- `server/src/services/driveSession.ts`
- `server/src/services/discoveryKnowledge.ts`
- `server/src/services/cache.ts`
- possibly `server/src/services/guides.ts`

### Backend new, if needed

- `server/src/services/storyBrief.ts`
- `server/src/services/guidePolicy.ts`
- an evidence type/helper module if clearer than placing it in `discoveryKnowledge.ts`

### Tests

Add focused tests rather than overloading one large test file.

Suggested:

- `server/test/storyBrief.test.ts`
- `server/test/narrativeExperience.test.ts`
- `server/test/storyContinuation.test.ts`

Update:

- `server/test/aiTaskRouter.test.ts`
- `server/package.json` test command

### Evaluation fixtures

Create:

```text
evaluation/golden/
  README.md
  narrative-v2.json
```

or an equivalent simple structure.

Do not add a new test framework solely for M1.

---

## 14. Files that should normally NOT change

Unless a concrete compatibility problem requires it:

- Discovery scoring modules;
- Google Places provider;
- ahead-discovery geometry;
- auth;
- admin;
- map design;
- native app architecture;
- realtime voice;
- navigation provider.

A large diff in those areas is a scope warning.

---

## 15. Golden Corpus

Use `Core_Experience_v2_M1_Golden_Corpus.md` as the initial human-readable quality reference.

Machine fixtures should encode:

- input evidence;
- guide;
- level;
- required traits;
- prohibited traits.

Golden samples are references, not exact-string snapshots.

Do not test LLM output by exact text equality.

---

## 16. Mandatory automated tests

### T1 — authoritative target preserved

Given a Federal Hall plan/evidence, generated request must still reference Federal Hall and cannot substitute another POI.

### T2 — provider abstraction preserved

Narrative generation still goes through:

`AITaskRouter(final_storytelling)`.

No direct OpenAI call is allowed from StoryBrief/NarrativePlan services.

### T3 — metadata isolation

Source URL/category/license metadata must not appear in user narration.

### T4 — weak evidence gate

No verified evidence -> story generation does not run.

Identification may still run.

### T5 — Dana/Arthur policy separation

The same factual evidence produces generation requests containing materially different guide policies and beat tendencies.

This test validates conditioning/contracts, not exact prose.

### T6 — short -> long continuation

Generate short successfully, then long for same POI.

Assert:

- long StoryBrief has continuation context;
- prior transcript is supplied as "already heard";
- cache identity differs;
- the prompt explicitly forbids restarting/repeating.

### T7 — direct long

Long without prior short still works.

### T8 — guide/language switch invalidates continuation

A Dana/Russian short must not become continuation context for Arthur/English.

### T9 — abort/supersede behavior preserved

A newer explicit selection still aborts previous generation.

### T10 — progressive TTS regression

Existing progressive speech tests continue to pass unchanged or with minimal contract adaptation.

### T11 — language validation preserved

Russian request cannot silently return mostly English source material.

### T12 — cache isolation

Dana/Arthur, short/long, and continuation/non-continuation outputs never collide.

---

## 17. Experience QA scenarios

### E1 — Federal Hall / Dana / short

Expected qualities:

- starts with an observation/contrast rather than a label;
- one strong reveal;
- conversational spoken rhythm;
- no date dump;
- no generic CTA.

### E2 — Federal Hall / Arthur / short

Same factual core, but:

- more precise distinction between the site and current building;
- stronger historical framing;
- calmer rhythm.

### E3 — Federal Hall short -> detailed

Detailed segment must introduce new context and explicitly behave as continuation.

It must not repeat the original opening or restate all short-story facts.

### E4 — weak POI

Input has only:

- name;
- category;
- coordinates.

Expected:

- identification only;
- no fabricated story.

### E5 — vehicle safety

Core Experience v2 narrative improvements must not bypass current vehicle duration/safety constraints.

---

## 18. Latency and cost

M1 is allowed one final-storytelling model call per generated segment.

Do not introduce a second quality LLM call for "planning" in this milestone.

Report:

- average StoryBrief build time;
- generation latency;
- TTS first-byte latency if available from current instrumentation;
- number of LLM calls per story;
- estimated text-generation cost;
- estimated TTS cost.

The deterministic StoryBrief layer should add negligible latency.

---

## 19. Definition of Done

Milestone 1 is PASS only if all are true:

### Architecture

- existing Discovery authority remains intact;
- NarrativePlan remains authoritative;
- provider abstraction remains intact;
- no parallel narrative subsystem is introduced;
- raw evidence is separated from user-facing plan fields.

### Experience

- short stories are structured spoken moments, not encyclopedia summaries;
- Dana and Arthur are recognizably different;
- weak evidence does not produce a story;
- long after short is a continuation;
- no unsupported facts are intentionally introduced by planning logic.

### Regression

- server typecheck passes;
- server test suite passes;
- shared typecheck passes;
- applicable mobile tests pass if API types changed;
- progressive audio remains functional.

### Reporting

PR description or attached report contains:

1. changed files;
2. contract changes;
3. tests run;
4. experience examples for Dana and Arthur;
5. short -> long example;
6. known failures;
7. latency results;
8. cost impact;
9. explicit PASS/FAIL for every acceptance item.

---

## 20. Work Mode execution instruction

Use this text when starting implementation:

> Implement **Core Experience v2 — Milestone 1: Narrative Engine v2** according to  
> `docs/context/Core_Experience_v2_M1_Narrative_Engine_Implementation_Spec.md`.
>
> Read `AGENTS.md`, `Core_Experience_v2_Canonical.md`, the milestone spec, and the existing NarrativePlan/AI routing architecture before editing.
>
> Audit existing types before creating new ones. Extend the current narrative pipeline; do not build a parallel subsystem.
>
> Preserve deterministic Discovery, safety, NarrativePlan authority, AITaskRouter and GenerativeProvider boundaries.
>
> Do not implement Milestones 2–5 or unrelated UI/native/realtime features.
>
> Work in a separate branch and open a PR. Do not merge it.
>
> Run every applicable test and acceptance scenario. Report failures honestly. The task is not complete merely because code compiles.

