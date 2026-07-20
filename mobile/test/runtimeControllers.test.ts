import assert from 'node:assert/strict';
import { clearRuntimeInterval } from '../src/features/live/runtimeControllerContracts';
import { createExploreNarrativeViewModel } from '../src/features/live/useExploreNarrative';
import { resetGuidedTourState } from '../src/features/live/useGuidedTourDemo';
import { startGuidedTour } from '../src/demo/guidedTour/controller';
import { shouldSyncPreferencesToTour } from '../src/presentation/liveForeground';

let cleared: number | null = null;
const intervalRef = { current: 42 };
clearRuntimeInterval(intervalRef, (id) => {
  cleared = id;
});
assert.equal(cleared, 42, 'Drive controller cleanup clears active interval');
assert.equal(intervalRef.current, null, 'Drive controller cleanup nulls interval ref');

const idleState = resetGuidedTourState('dana', 'en');
const activeState = startGuidedTour(idleState);
assert.equal(shouldSyncPreferencesToTour(activeState.journeyState), false, 'Guided Tour controller locks guide after start');
assert.equal(shouldSyncPreferencesToTour(idleState.journeyState), true, 'Guided Tour controller allows preference sync while idle');

const resetState = resetGuidedTourState('arthur', 'ru');
assert.equal(resetState.journeyState, 'idle', 'mode reset returns guided controller to idle state');
assert.equal(resetState.guideId, 'arthur', 'mode reset preserves intended guide');
assert.equal(resetState.guideLanguage, 'ru', 'mode reset preserves intended language');

const exploreModel = createExploreNarrativeViewModel({
  targetId: 'trinity_church',
  isPaused: false,
  guideId: 'arthur',
  guideLanguage: 'en',
});
assert.equal(Object.prototype.hasOwnProperty.call(exploreModel, 'routeMeta'), false, 'Explore controller does not leak route metadata');
assert.equal(Object.prototype.hasOwnProperty.call(exploreModel, 'tourTitle'), false, 'Explore controller does not leak guided tour title');

console.log('runtimeControllers tests passed');
