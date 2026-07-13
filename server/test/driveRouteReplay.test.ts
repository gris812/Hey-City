import assert from 'node:assert/strict';
import {
  loadDriveReplayFixture,
  runDriveRouteReplay,
} from '../src/replay/driveRouteReplay';

async function run(): Promise<void> {
  const fixture = loadDriveReplayFixture('../data/routes/federal-hall-drive-replay.json');
  const result = await runDriveRouteReplay(fixture);

  assert.equal(result.summary.triggerCount, 1);
  assert.deepEqual(result.summary.triggeredPoiIds, ['poi_federal_hall']);
  assert.equal(result.summary.finishCount, 1);
  assert.ok(result.summary.holdReasons.includes('speed_too_low'));
  assert.ok(result.summary.holdReasons.includes('already_listening'));
  assert.ok(result.summary.holdReasons.includes('cooldown_active'));

  const triggerStep = result.steps.find(
    (step) => step.type === 'ping' && step.decisionType === 'trigger_story'
  );
  assert.equal(triggerStep?.type, 'ping');
  assert.equal(triggerStep?.estimatedDurationSec, 40);

  console.log('driveRouteReplay tests passed');
}

void run();
