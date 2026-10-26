import assert from 'node:assert/strict';
import {
  isDuplicateExplicitSelection,
  ownsPlaybackCallback,
  shouldAcceptAutomaticPlay,
  shouldSendCompletion,
} from '../src/features/live/storyOwnership';

const selection = { poiId: 'A', level: 'short' as const, revision: 1 };
assert.equal(isDuplicateExplicitSelection(selection, 'A', 'short'), true);
assert.equal(isDuplicateExplicitSelection(selection, 'B', 'short'), false);
assert.equal(isDuplicateExplicitSelection(null, 'A', 'short'), false);
assert.equal(shouldAcceptAutomaticPlay(selection, null), false, 'pending explicit A blocks automatic B');
assert.equal(shouldAcceptAutomaticPlay(null, 'selected:A:123:1'), false, 'active explicit A blocks next ping');
assert.equal(shouldAcceptAutomaticPlay(null, 'auto-B'), true, 'ordinary discovery remains eligible');
assert.equal(ownsPlaybackCallback('moment-A', 'moment-B'), false, 'late callback cannot impersonate A');
assert.equal(shouldSendCompletion('moment-A', 'moment-B', null), false, 'superseded B must not complete');
assert.equal(shouldSendCompletion('moment-A', 'moment-A', 'moment-A'), false, 'repeated finish is rejected');
assert.equal(shouldSendCompletion('moment-A', 'moment-A', null), true, 'current moment finishes once');

console.log('story ownership regressions passed');
