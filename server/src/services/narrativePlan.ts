import type { DiscoveryMode, NarrativePlan, NarrativePlanInput } from '@heycity/shared';
import { discoveryConfig } from '../config';
import { buildStoryBrief, StoryBrief, StoryContinuationState } from './storyBrief';
import { EvidenceBundle } from './evidence';
import { guidePolicy } from './guidePolicy';
import type { NarrativeLevel } from '@heycity/shared';

export interface MockNarration {
  transcriptText: string;
  estimatedDurationSec: number;
}

export function createNarrativePlan(input: NarrativePlanInput, brief?: StoryBrief): NarrativePlan {
  const vehicleSafe = input.mode === 'vehicle';
  const maxDurationSec = vehicleSafe
    ? discoveryConfig.vehicleStoryMaxSeconds
    : Math.max(input.targetDurationSec, discoveryConfig.vehicleStoryMaxSeconds);

  const { storySeed: _legacySource, ...publicInput } = input;
  return {
    ...publicInput,
    level: brief?.level ?? 'auto',
    moment: brief?.moment ?? { relationship: 'new_topic', intent: 'notice', delivery: 'brief_story' },
    narrativeAngle: brief?.narrativeAngle ?? 'Notice the approved place',
    beats: brief?.beats ?? [],
    mustAvoid: brief?.constraints.forbiddenPatterns ?? [],
    evidenceRefs: brief?.selectedEvidenceRefs ?? [],
    targetDurationSec: vehicleSafe
      ? clamp(
          input.targetDurationSec,
          discoveryConfig.vehicleStoryMinSeconds,
          discoveryConfig.vehicleStoryMaxSeconds
        )
      : input.targetDurationSec,
    safety: {
      vehicleSafe,
      maxDurationSec,
      visualLoad: vehicleSafe ? 'minimal' : 'normal',
    },
    structure: ['hook', 'context', 'fact', 'closing'],
  };
}

/** Same plan constructor owns safety in every path, including explicit long requests. */
export function prepareNarrative(input: NarrativePlanInput, evidence: EvidenceBundle,
  options: { level: NarrativeLevel; language: string; continuation?: StoryContinuationState }) {
  const policy = guidePolicy(input.guideId);
  const safe = createNarrativePlan({ ...input, guideId: policy.id });
  const brief = buildStoryBrief(safe, evidence, policy, options);
  return { plan: createNarrativePlan(safe, brief), brief, policy };
}

export function createMockNarration(plan: NarrativePlan): MockNarration {
  const seed =
    plan.storySeed ||
    `${plan.placeName} is a meaningful place in the city, worth noticing as you pass.`;

  if (plan.mode === 'vehicle') {
    return {
      transcriptText:
        `${plan.placeName}. ${seed} ` +
        'Keep your eyes on the road; I will keep this brief. ' +
        'This is a good marker to save for a deeper look when you stop.',
      estimatedDurationSec: clamp(plan.targetDurationSec, 30, 45),
    };
  }

  return {
    transcriptText:
      `${plan.placeName}. ${seed} ` +
      'There is enough context here for a slower walk, a closer look, and a follow-up question.',
    estimatedDurationSec: plan.targetDurationSec,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
