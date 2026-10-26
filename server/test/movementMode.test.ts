import assert from 'node:assert/strict';
import { createSession, stopSession, updateSessionMode } from '../src/services/driveSession';

const session = createSession('mode-test-user', {
  mode: 'walking',
  autoMode: true,
  themeTags: ['mixed'],
  narrationStyle: 'documentary',
  lengthSec: 90,
  leadTimeMin: 2,
  voiceId: 'dana',
  language: 'ru',
  autoplay: true,
});

assert.equal(updateSessionMode(session, 16), 'walking', 'one fast sample must not switch mode');
assert.equal(updateSessionMode(session, 18), 'vehicle', 'two fast samples switch to vehicle');
assert.equal(updateSessionMode(session, 10), 'vehicle', 'hysteresis keeps vehicle mode between thresholds');
assert.equal(updateSessionMode(session, 6), 'vehicle', 'one slow sample must not switch mode');
assert.equal(updateSessionMode(session, 4), 'walking', 'two slow samples switch back to walking');

stopSession(session.id);
console.log('movement mode tests passed');

const highway = createSession('highway-test', { ...session.params, mode: 'walking', autoMode: true });
const highwayKmh = 70 * 1.609344;
assert.equal(updateSessionMode(highway, highwayKmh, 1000), 'walking');
assert.equal(updateSessionMode(highway, highwayKmh, 1000), 'walking', 'same fix is not confirmation');
assert.equal(updateSessionMode(highway, highwayKmh, 2000), 'vehicle');
assert.equal(updateSessionMode(highway, 0, 3000), 'vehicle', 'brief stop stays vehicle');
assert.equal(updateSessionMode(highway, -1, 4000), 'vehicle', 'unknown does not confirm a stop');
assert.equal(updateSessionMode(highway, 0, 5000), 'vehicle');
assert.equal(updateSessionMode(highway, 10, 6000), 'vehicle', 'jitter in hysteresis cancels a transition');
assert.equal(updateSessionMode(highway, 5, 7000), 'vehicle');
assert.equal(updateSessionMode(highway, 4, 8000), 'walking');
assert.equal(updateSessionMode(highway, highwayKmh, 7000), 'walking', 'late fix ignored');
stopSession(highway.id);

import { observedSpeedKmh } from '../src/controllers/drive';
assert.equal(observedSpeedKmh(null, 1000, 2000), -1);
assert.equal(observedSpeedKmh(undefined, 1000, 2000), -1);
assert.equal(observedSpeedKmh(0, 1000, 2000), 0);
assert.equal(observedSpeedKmh(0, 1000, 40000), -1, 'stale fix is not a stop');
assert.equal(observedSpeedKmh(highwayKmh, 1000, 2000), highwayKmh);
