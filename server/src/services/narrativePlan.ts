import type { DiscoveryMode, NarrativePlan, NarrativePlanInput } from '@heycity/shared';
import { discoveryConfig } from '../config';

export interface MockNarration {
  transcriptText: string;
  estimatedDurationSec: number;
}

export function createNarrativePlan(input: NarrativePlanInput): NarrativePlan {
  const vehicleSafe = input.mode === 'vehicle';
  const maxDurationSec = vehicleSafe
    ? discoveryConfig.vehicleStoryMaxSeconds
    : Math.max(input.targetDurationSec, discoveryConfig.vehicleStoryMaxSeconds);

  return {
    ...input,
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
