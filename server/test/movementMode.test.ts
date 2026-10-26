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

// 70 mph is ~112.65 km/h; server hysteresis remains authoritative.
const highway = createSession('highway-field-test', { ...session.params, mode:'walking', autoMode:true });
assert.equal(updateSessionMode(highway, 112.65), 'walking', 'first 70 mph sample is not yet confirmed');
assert.equal(updateSessionMode(highway, 112.65), 'vehicle', 'second 70 mph sample selects vehicle');
assert.equal(updateSessionMode(highway, Number.NaN), 'vehicle', 'missing speed is not a stop');
assert.equal(updateSessionMode(highway, 8), 'vehicle', 'low-speed jitter in hysteresis band keeps vehicle');
assert.equal(updateSessionMode(highway, 0), 'vehicle', 'single stopped sample does not switch');
assert.equal(updateSessionMode(highway, Number.NaN), 'vehicle', 'unknown samples do not force a walking switch');
assert.equal(updateSessionMode(highway, 4), 'walking', 'confirmed subsequent walking speed changes mode');
stopSession(highway.id);

stopSession(session.id);
console.log('movement mode tests passed');
