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
