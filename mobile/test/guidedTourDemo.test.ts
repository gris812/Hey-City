import {
  analyzeLocationEvent,
  beginNarrative,
  completeNarrative,
  continueToNextTarget,
  createInitialGuidedTourState,
  defaultExplorationMode,
  explorationModes,
  pauseGuidedTour,
  resumeGuidedTour,
  startGuidedTour,
  tickAutoContinue,
  tourBLocationEvents,
} from '../src/demo/guidedTour';
import { tourA, tourB, tourBTargets } from '../src/demo/tours';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(JSON.stringify(explorationModes), JSON.stringify(['city_explorer', 'guided_tour', 'drive_discovery']), 'canonical modes are exact');
assert(!explorationModes.includes('exploring' as never), 'exploring is not selectable mode');
assertEqual(defaultExplorationMode, 'city_explorer', 'default mode is city explorer');

assertEqual(tourA.targets.length, 7, 'Tour A has seven metadata targets');
assertEqual(tourBTargets.length, 4, 'Tour B has four targets');
assertEqual(tourBTargets.map((target) => target.name).join('|'), 'Trinity Church|One World Trade Center|9/11 Memorial|Battery Park City / Marina', 'Tour B target order is fixed');
for (const target of tourBTargets) {
  assert(typeof target.coordinates.latitude === 'number', 'target has latitude');
  assert(target.route.routeCoordinates.length > 0, 'target has route coordinates');
  assert(target.narratives.dana.en.arrivalText.length > 0, 'target has Dana EN narrative');
  assert(target.narratives.dana.ru.arrivalText.length > 0, 'target has Dana RU narrative');
  assert(target.narratives.arthur.en.arrivalText.length > 0, 'target has Arthur EN narrative');
  assert(target.narratives.arthur.ru.arrivalText.length > 0, 'target has Arthur RU narrative');
  assert(Boolean(target.narratives.dana.en.approachText), 'target has Dana EN approach text');
  assert(Boolean(target.narratives.dana.ru.approachText), 'target has Dana RU approach text');
  assert(Boolean(target.narratives.arthur.en.approachText), 'target has Arthur EN approach text');
  assert(Boolean(target.narratives.arthur.ru.approachText), 'target has Arthur RU approach text');
  assert(target.facts.length > 0 && target.facts.every((fact) => fact.sourceReference.length > 0), 'target has facts with sources');
  assert(target.triggerRadii.arrivalMeters > 0, 'target has trigger radii');
  if (target.route.nextTargetId) {
    assert(tourB.targetIds.includes(target.route.nextTargetId), 'route next target id is valid');
  }
}

for (let i = 1; i < tourBLocationEvents.length; i += 1) {
  assert(tourBLocationEvents[i].timestampMs >= tourBLocationEvents[i - 1].timestampMs, 'timestamps monotonic');
  assert(tourBLocationEvents[i].heading >= 0 && tourBLocationEvents[i].heading <= 360, 'heading valid');
  assert(tourBLocationEvents[i].speedKmh >= 0, 'speed non-negative');
}
assertEqual(JSON.stringify(tourBLocationEvents), JSON.stringify([...tourBLocationEvents]), 'Tour B fixture is deterministic');

let state = createInitialGuidedTourState('dana', 'en');
assertEqual(state.journeyState, 'idle', 'initial state is idle');
state = startGuidedTour(state);
assertEqual(state.journeyState, 'exploring', 'start transitions to exploring');

const firstTarget = tourBTargets[0];
state = analyzeLocationEvent(state, {
  latitude: firstTarget.coordinates.latitude + 0.0005,
  longitude: firstTarget.coordinates.longitude,
  heading: 180,
  speedKmh: 4,
  timestampMs: 1,
});
assertEqual(state.journeyState, 'approaching', 'approach radius transitions to approaching');

state = analyzeLocationEvent(state, {
  latitude: firstTarget.coordinates.latitude,
  longitude: firstTarget.coordinates.longitude,
  heading: 180,
  speedKmh: 0,
  timestampMs: 2,
});
assertEqual(state.journeyState, 'arrived', 'arrival radius transitions to arrived');
const arrivedCount = state.arrivedTargetIds.length;
state = analyzeLocationEvent(state, {
  latitude: firstTarget.coordinates.latitude,
  longitude: firstTarget.coordinates.longitude,
  heading: 180,
  speedKmh: 0,
  timestampMs: 3,
});
assertEqual(state.arrivedTargetIds.length, arrivedCount, 'arrival triggers once');

state = beginNarrative(state);
assertEqual(state.journeyState, 'narrating', 'arrival begins narrative');
state = completeNarrative(state);
assertEqual(state.journeyState, 'waiting_to_continue', 'narrative waits to continue');
const paused = pauseGuidedTour(state);
assertEqual(paused.isPaused, true, 'pause freezes timers');
assertEqual(tickAutoContinue(paused, 5000).currentTargetIndex, paused.currentTargetIndex, 'paused auto-continue does not advance');
state = resumeGuidedTour(paused);
assertEqual(state.isPaused, false, 'resume clears paused flag');
state = tickAutoContinue(state, tourB.continueDelaySec * 1000);
assertEqual(state.currentTargetIndex, 1, 'auto-continue advances target');
assertEqual(state.completedTargetIds[0], firstTarget.id, 'completed target accumulates');

const danaText = tourBTargets[1].narratives.dana.en.arrivalText;
const arthurText = tourBTargets[1].narratives.arthur.en.arrivalText;
assert(danaText !== arthurText, 'selected guide controls narrative source');
assert(!arthurText.includes('Dana'), 'Arthur narrative does not use Dana copy');
assert(tourBTargets[1].narratives.arthur.ru.arrivalText !== arthurText, 'guide language selects RU story');
assert(tourB.completionNarratives.arthur.ru.length > 0, 'completion follows guide and language');

let completionState = createInitialGuidedTourState('arthur', 'ru');
completionState = startGuidedTour(completionState);
for (const target of tourBTargets) {
  completionState = {
    ...completionState,
    currentTargetIndex: target.sequence - 1,
    currentTargetId: target.id,
    journeyState: 'waiting_to_continue',
    narrativeState: 'completed',
  };
  completionState = continueToNextTarget(completionState);
}
assertEqual(completionState.journeyState, 'completed', 'final target transitions to completed');
assertEqual(completionState.completedTargetIds.length, 4, 'no target is skipped');

console.log('guidedTourDemo tests passed');
