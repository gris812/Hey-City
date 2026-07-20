import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  closeTranscriptOverlay,
  createExploreHomeViewModel,
  guidedNavigationControlIds,
  openTranscriptOverlay,
  selectLiveForegroundPhase,
  shouldSyncPreferencesToTour,
} from '../src/presentation/liveForeground';
import {
  createInitialGuidedTourState,
  startGuidedTour,
} from '../src/demo/guidedTour/controller';

const defaultInput = {
  mode: 'guided_tour' as const,
  journeyState: 'exploring' as const,
  narrativeState: 'hidden' as const,
  isPaused: false,
  driveSessionActive: false,
  driveDiscoveryOn: false,
  overlayKind: null,
};

assert.equal(
  typeof selectLiveForegroundPhase(defaultInput),
  'string',
  'foreground selector returns exactly one phase'
);

const exploreModel = createExploreHomeViewModel({
  areaName: 'Financial District - Nearby',
  guideId: 'dana',
  guideName: 'Dana',
  guideLanguage: 'en',
  ambientCopy: 'Walk naturally. Dana will speak when a nearby detail matters.',
});

assert.equal(
  Object.prototype.hasOwnProperty.call(exploreModel, 'routeMeta'),
  false,
  'Explore view model does not expose fixed route metadata'
);
assert.equal(
  JSON.stringify(exploreModel).includes('Downtown Manhattan Walk'),
  false,
  'Explore view model does not expose a fixed guided-tour title'
);

assert.deepEqual(
  [...guidedNavigationControlIds],
  ['pause_resume', 'transcript', 'end_tour'],
  'Guided Navigation exposes one canonical control set'
);

assert.equal(
  selectLiveForegroundPhase({
    ...defaultInput,
    journeyState: 'narrating',
    narrativeState: 'arrival',
  }),
  'guided_story_active',
  'narrating selects Active Story foreground'
);

assert.equal(
  selectLiveForegroundPhase({
    ...defaultInput,
    journeyState: 'approaching',
    narrativeState: 'approach',
  }),
  'guided_approaching',
  'approaching selects explicit Approaching foreground'
);

assert.equal(
  selectLiveForegroundPhase({
    ...defaultInput,
    journeyState: 'at_target',
    narrativeState: 'arrival',
  }),
  'guided_at_target',
  'at-target selects explicit At Target foreground before story'
);

assert.equal(
  selectLiveForegroundPhase({
    ...defaultInput,
    journeyState: 'waiting_to_continue',
    narrativeState: 'completed',
  }),
  'guided_story_complete',
  'waiting-to-continue selects Story Complete foreground'
);

const transcript = openTranscriptOverlay('guided_story_active');
assert.equal(
  closeTranscriptOverlay(transcript),
  'guided_story_active',
  'transcript restores its prior foreground phase'
);

const startedTour = startGuidedTour(createInitialGuidedTourState('arthur', 'en'));
assert.equal(startedTour.journeyState, 'exploring', 'Tour Preferences still starts the guided demo');
assert.equal(startedTour.guideId, 'arthur', 'Tour Preferences preserves selected guide when starting');

assert.equal(shouldSyncPreferencesToTour('narrating'), false, 'guide remains locked during active tour');
assert.equal(shouldSyncPreferencesToTour('idle'), true, 'guide can sync before a tour starts');
assert.equal(shouldSyncPreferencesToTour('completed'), true, 'guide can sync after a tour completes');

const resetTour = createInitialGuidedTourState(startedTour.guideId, startedTour.guideLanguage);
assert.equal(resetTour.journeyState, 'idle', 'mode switching reset still returns guided tour to idle');
assert.equal(resetTour.currentTargetIndex, 0, 'mode switching reset returns guided route to first target');

const driveSource = readFileSync(join(process.cwd(), 'src/api/drive.ts'), 'utf8');
assert.match(driveSource, /export async function startDriveSession/, 'Drive start API export unchanged');
assert.match(driveSource, /export async function pingDriveSession/, 'Drive ping API export unchanged');
assert.match(driveSource, /export async function finishDriveStory/, 'Drive finish API export unchanged');
assert.match(driveSource, /export async function stopDriveSession/, 'Drive stop API export unchanged');

console.log('liveForeground tests passed');
