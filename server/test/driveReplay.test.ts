import type { DiscoveryDecision } from '@heycity/shared';
import assert from 'node:assert/strict';
import { evaluateDiscoveryDecision } from '../src/services/driveDecision';
import { createMockNarration, createNarrativePlan } from '../src/services/narrativePlan';

const federalHall = {
  poiId: 'poi_federal_hall',
  placeName: 'Federal Hall',
  distanceMeters: 840,
  etaSeconds: 85,
  storySeed:
    'This is where George Washington took the oath as the first President of the United States.',
};

const routePoints = [
  { nowMs: 0, speedKmh: 36, heading: 170, distanceMeters: 1300, etaSeconds: 150 },
  { nowMs: 10_000, speedKmh: 34, heading: 172, distanceMeters: 840, etaSeconds: 85 },
  { nowMs: 20_000, speedKmh: 35, heading: 93, distanceMeters: 780, etaSeconds: 78 },
  { nowMs: 40_000, speedKmh: 33, heading: 176, distanceMeters: 720, etaSeconds: 70 },
];

const decisions: DiscoveryDecision[] = [];
let lastStoryStartedAtMs = 0;
let alreadyListening = false;

for (const point of routePoints) {
  const decision = evaluateDiscoveryDecision({
    mode: 'vehicle',
    speedKmh: point.speedKmh,
    gpsAgeSeconds: 1,
    alreadyListening,
    budgetGuardrail: false,
    lastStoryStartedAtMs,
    nowMs: point.nowMs,
    leadTimeSec: 120,
    guideId: 'artur',
    themeTags: ['history'],
    candidates: [
      {
        ...federalHall,
        distanceMeters: point.distanceMeters,
        etaSeconds: point.etaSeconds,
      },
    ],
    targetDurationSec: 40,
  });

  decisions.push(decision);
  if (decision.type === 'trigger_story') {
    lastStoryStartedAtMs = point.nowMs;
    alreadyListening = true;
  }
}

const triggers = decisions.filter((decision) => decision.type === 'trigger_story');
assert.equal(triggers.length, 1);

const trigger = triggers[0];
assert.equal(trigger.type, 'trigger_story');
assert.equal(trigger.poiId, 'poi_federal_hall');
assert.equal(trigger.triggerReason, 'eta');

const heldAfterTrigger = decisions.slice(2);
assert.ok(
  heldAfterTrigger.every(
    (decision) =>
      decision.type === 'hold' &&
      (decision.reason === 'already_listening' || decision.reason === 'cooldown_active')
  )
);

const plan = createNarrativePlan(trigger.narrativePlanInput);
const narration = createMockNarration(plan);
assert.equal(plan.mode, 'vehicle');
assert.equal(plan.safety.vehicleSafe, true);
assert.ok(narration.estimatedDurationSec >= 30);
assert.ok(narration.estimatedDurationSec <= 45);
assert.ok(narration.transcriptText.includes('Federal Hall'));

console.log('driveReplay tests passed');
