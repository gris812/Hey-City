import assert from 'node:assert/strict';
import { classifyApiHealthPayload } from '../src/api/health';
import { exploreTopLayout } from '../src/presentation/safeAreaLayout';

const compatible = classifyApiHealthPayload({
  service: 'hey-city-api',
  buildSha: 'pr17-head',
  capabilities: ['core_v2_m3_conversation', 'm4_realtime_voice'],
});
assert.equal(compatible.reachable, true);
assert.equal(compatible.compatible, true);
assert.equal(compatible.buildSha, 'pr17-head');

const productionMain = classifyApiHealthPayload({
  status: 'ok',
  service: 'sunshine-ai-guide-api',
});
assert.equal(productionMain.compatible, false);
assert.match(productionMain.reason ?? '', /M4 realtime/i);

assert.deepEqual(exploreTopLayout(0, 16), { controlTop: 16, searchTop: 76, statusTop: 142 });
assert.deepEqual(exploreTopLayout(59, 16), { controlTop: 75, searchTop: 135, statusTop: 201 });
assert.deepEqual(exploreTopLayout(-10, 16), { controlTop: 16, searchTop: 76, statusTop: 142 });

// Regression for Expo GPS units and unreliable missing/negative speed.
const { gpsSpeedKmh } = require('../src/features/live/gpsMotion') as typeof import('../src/features/live/gpsMotion');
assert.equal(gpsSpeedKmh(112.65 / 3.6), 112.65);
assert.equal(gpsSpeedKmh(0), 0, 'zero is an actual stopped sample');
assert.equal(gpsSpeedKmh(-1), null, 'unknown native speed cannot be treated as stopped');
assert.equal(gpsSpeedKmh(null), null);
assert.equal(gpsSpeedKmh(Number.NaN), null);

console.log('native field readiness: backend compatibility and safe-area layout passed');
