# 05 — NarrativePlan Flow

## Purpose

`NarrativePlan` is the contract between deterministic product logic and generative AI.

It prevents the LLM from making product decisions.

## Flow

```mermaid
sequenceDiagram
    participant Mobile
    participant API as Backend API
    participant Discovery as Discovery Engine
    participant Brain as AI Guide Brain
    participant Planner as Narrative Planner
    participant Evidence as Evidence Providers
    participant Generator as Narrative Generator
    participant Grounded as Grounded Narrative Provider
    participant TTS as TTS Provider
    participant Storage as Audio Cache
    participant Player as Mobile Player

    Mobile->>API: session ping
    API->>Discovery: build DiscoveryDecision
    Discovery-->>API: trigger_story or hold

    alt hold
        API-->>Mobile: hold reason + state
    else trigger_story
        API->>Brain: selected POI + context
        Brain->>Planner: create NarrativePlan
        Planner-->>Brain: NarrativePlan
        Brain->>Evidence: load reusable factual evidence
        Evidence-->>Brain: EvidenceBundle
        alt grounded provider selected
            Brain->>Grounded: plan + evidence + provider policy
            Grounded-->>Brain: final text + attribution
        else standard generator or fallback
            Brain->>Generator: plan + evidence
            Generator-->>Brain: story text
        end
        Brain->>TTS: synthesize audio
        TTS->>Storage: cache audio
        Storage-->>API: audio URL + attribution metadata
        API-->>Player: story metadata + audio URL + attribution
    end
```

## Grounded generation boundary

`NarrativePlan` remains authoritative regardless of the selected provider. A grounded model may
find supporting information and formulate language, but it must not choose the POI, discovery
profile, story level, distance wording, duration, or interruption policy.

Two provider contracts are kept separate:

```ts
interface EvidenceProvider {
  collect(input: EvidenceRequest): Promise<EvidenceBundle>;
}

interface GroundedNarrativeProvider {
  generate(input: GroundedNarrativeRequest): Promise<GroundedNarrativeResult>;
}
```

- `EvidenceProvider` returns reusable, normalized factual claims from sources whose terms allow
  that use.
- `GroundedNarrativeProvider` returns final user-facing text plus the citations and attribution
  required by that provider.
- Provider-specific restrictions on storage, transformation, language, geography, and attribution
  travel with the result and are enforced before caching or delivery.
- A deterministic or evidence-only generator remains the fallback when grounded generation is
  unavailable.

## NarrativePlan shape

Recommended MVP shape:

```ts
type NarrativePlan = {
  planId: string;
  sessionId: string;
  poiId: string;
  guideId: "dana" | "arthur";
  mode: "walking" | "vehicle" | "explore";

  language: string;
  targetDurationSeconds: number;

  storyType:
    | "area_intro"
    | "poi_story"
    | "transition"
    | "hidden_gem"
    | "historical_context"
    | "architecture_note"
    | "closing";

  theme: "history" | "architecture" | "culture" | "food" | "urban_legend" | "hidden_fact" | "lifestyle";

  hook: string;
  factualAnchors: Array<{
    label: string;
    value: string;
    source?: string;
  }>;

  angle: string;
  mustMention: string[];
  mustAvoid: string[];

  safety: {
    vehicleSafe: boolean;
    maxSentenceCount?: number;
    maxWords?: number;
    allowVisualInstructions: boolean;
  };

  delivery: {
    textOnly: boolean;
    audioPreferred: boolean;
    cacheKey: string;
  };
};
```

## Mock generation rule

Before LLM integration, `NarrativePlan` should be convertible into deterministic mock text.

Example:

```text
[Arthur] Federal Hall is just ahead. This site matters because it connects directly to the earliest days of American government. In Vehicle Mode, keep this short: one strong fact, one piece of context, and a clean ending.
```

## QA checks

Story output should be checked for:
- target duration
- vehicle-safe wording
- no long instructions
- factual anchors included
- no invented facts beyond plan
- persona consistency
- no guide overlap
