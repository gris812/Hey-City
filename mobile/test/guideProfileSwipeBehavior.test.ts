import assert from 'node:assert/strict';
import {
  resolveGuideSwipe,
  shouldCaptureGuideSwipe,
} from '../src/features/guides/guideProfileInteraction';

assert.equal(shouldCaptureGuideSwipe(70, 10), true, 'horizontal gesture is captured');
assert.equal(shouldCaptureGuideSwipe(-70, 10), true, 'horizontal gesture in either direction is captured');
assert.equal(shouldCaptureGuideSwipe(12, 80), false, 'vertical ScrollView gesture is not captured');
assert.equal(shouldCaptureGuideSwipe(18, 2), false, 'small movement remains available to buttons/taps');

assert.equal(resolveGuideSwipe('dana', -70, 8), 'arthur', 'left swipe Dana -> Arthur');
assert.equal(resolveGuideSwipe('arthur', 70, 8), 'dana', 'right swipe Arthur -> Dana');
assert.equal(resolveGuideSwipe('dana', 30, 2), 'dana', 'sub-threshold horizontal movement does not switch');
assert.equal(resolveGuideSwipe('arthur', 12, 80), 'arthur', 'vertical scroll does not switch guide');

console.log('guide profile swipe behavioral tests passed');
