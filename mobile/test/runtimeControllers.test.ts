import assert from 'node:assert/strict';
import { clearRuntimeInterval } from '../src/features/live/runtimeControllerContracts';
import {
  createDriveDiscoveryHarness,
  pingDriveDiscoveryHarness,
  startDriveDiscoveryHarness,
  stopDriveDiscoveryHarness,
} from '../src/features/live/driveDiscoveryHarness';
import { createExploreNarrativeViewModel } from '../src/features/live/useExploreNarrative';
import {
  advanceGuidedTourHarness,
  createGuidedTourHarness,
  resetGuidedTourState,
  startStoryInGuidedTourHarness,
} from '../src/features/live/useGuidedTourDemo';
import { startGuidedTour } from '../src/demo/guidedTour/controller';
import { shouldSyncPreferencesToTour } from '../src/presentation/liveForeground';

let cleared: number | null = null;
const intervalRef = { current: 42 };
clearRuntimeInterval(intervalRef, (id) => {
  cleared = id;
});
assert.equal(cleared, 42, 'Drive controller cleanup clears active interval');
assert.equal(intervalRef.current, null, 'Drive controller cleanup nulls interval ref');

let driveHarness = createDriveDiscoveryHarness('arthur');
assert.equal(driveHarness.backendVoiceId, 'artur', 'Drive harness preserves legacy backend voice conversion');
driveHarness = startDriveDiscoveryHarness(driveHarness);
assert.equal(driveHarness.sessionId, 'drive-session-test', 'Drive harness start creates session state');
assert.equal(driveHarness.startCalls, 1, 'Drive harness authenticated start calls API once');
assert.equal(driveHarness.intervalCreated, true, 'Drive harness creates ping interval once');
driveHarness = pingDriveDiscoveryHarness(driveHarness);
assert.equal(driveHarness.pingCalls, 1, 'Drive harness pings while active');
driveHarness = stopDriveDiscoveryHarness(driveHarness);
assert.equal(driveHarness.intervalCleared, true, 'Drive harness stop clears interval');
const afterCleanup = pingDriveDiscoveryHarness(driveHarness);
assert.equal(afterCleanup.pingCalls, 1, 'Drive harness does not ping after cleanup');

const idleState = resetGuidedTourState('dana', 'en');
const activeState = startGuidedTour(idleState);
assert.equal(shouldSyncPreferencesToTour(activeState.journeyState), false, 'Guided Tour controller locks guide after start');
assert.equal(shouldSyncPreferencesToTour(idleState.journeyState), true, 'Guided Tour controller allows preference sync while idle');

const resetState = resetGuidedTourState('arthur', 'ru');
assert.equal(resetState.journeyState, 'idle', 'mode reset returns guided controller to idle state');
assert.equal(resetState.guideId, 'arthur', 'mode reset preserves intended guide');
assert.equal(resetState.guideLanguage, 'ru', 'mode reset preserves intended language');

let guidedHarness = createGuidedTourHarness({ guideId: 'arthur', guideLanguage: 'ru', autoplay: false });
for (let i = 0; i < 20 && guidedHarness.state.journeyState !== 'at_target'; i += 1) {
  guidedHarness = advanceGuidedTourHarness(guidedHarness);
}
assert.equal(guidedHarness.state.journeyState, 'at_target', 'Guided harness progression reaches at-target');
guidedHarness = advanceGuidedTourHarness(guidedHarness, 5000);
assert.equal(guidedHarness.state.journeyState, 'at_target', 'autoplay-off waits at target');
guidedHarness = startStoryInGuidedTourHarness(guidedHarness);
assert.equal(guidedHarness.state.journeyState, 'narrating', 'Start Story begins narration when autoplay is off');
guidedHarness = advanceGuidedTourHarness(guidedHarness, 30_000);
guidedHarness = advanceGuidedTourHarness(guidedHarness, 5_000);
for (let i = 0; i < 30 && guidedHarness.state.journeyState !== 'approaching'; i += 1) {
  guidedHarness = advanceGuidedTourHarness(guidedHarness);
}
assert.equal(guidedHarness.state.journeyState, 'approaching', 'Guided harness progression reaches approaching on the next segment');

let autoplayHarness = createGuidedTourHarness({ guideId: 'dana', guideLanguage: 'en', autoplay: true });
for (let i = 0; i < 40 && autoplayHarness.state.journeyState !== 'narrating'; i += 1) {
  autoplayHarness = advanceGuidedTourHarness(autoplayHarness, 700);
}
assert.equal(autoplayHarness.state.journeyState, 'narrating', 'autoplay starts narrative after arrival delay');
autoplayHarness = advanceGuidedTourHarness(autoplayHarness, 30_000);
assert.equal(autoplayHarness.state.journeyState, 'waiting_to_continue', 'narrative completion remains correct');
autoplayHarness = advanceGuidedTourHarness(autoplayHarness, 5_000);
assert.equal(autoplayHarness.state.currentTargetIndex, 1, 'auto-continue remains correct');

const exploreModel = createExploreNarrativeViewModel({
  targetId: 'trinity_church',
  isPaused: false,
  guideId: 'arthur',
  guideLanguage: 'en',
});
assert.equal(Object.prototype.hasOwnProperty.call(exploreModel, 'routeMeta'), false, 'Explore controller does not leak route metadata');
assert.equal(Object.prototype.hasOwnProperty.call(exploreModel, 'tourTitle'), false, 'Explore controller does not leak guided tour title');

console.log('runtimeControllers tests passed');
