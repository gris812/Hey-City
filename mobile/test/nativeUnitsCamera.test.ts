import assert from 'node:assert/strict';
import { formatDistance, formatSpeed } from '../src/localization/measurement';
import { courseHeading, normalizeDegrees, shortestHeadingDelta, shouldUpdateCamera } from '../src/presentation/cameraOrientation';

assert.equal(formatDistance(750, 'metric'), '750 m');
assert.equal(formatDistance(1609.344, 'imperial'), '1.0 mi');
assert.equal(formatSpeed(112.65408, 'imperial'), '70 mph');
assert.equal(formatSpeed(112.65408, 'metric'), '113 km/h');
assert.equal(formatSpeed(Number.NaN, 'imperial'), '—');

assert.equal(normalizeDegrees(-1), 359);
assert.equal(courseHeading(359, 70), 359);
assert.equal(courseHeading(-1, 70), null);
assert.equal(courseHeading(90, 1), null, 'low speed must not rotate camera');
assert.equal(shortestHeadingDelta(359, 1), 2, 'north crossover takes shortest rotation');
assert.equal(shortestHeadingDelta(1, 359), -2);
assert.equal(shouldUpdateCamera(false, true), false, 'manual panning suppresses auto-follow');
assert.equal(shouldUpdateCamera(true, true), true);
assert.equal(shouldUpdateCamera(true, false), false);

console.log('native units and camera policy tests passed');
