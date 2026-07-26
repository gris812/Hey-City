import assert from 'node:assert/strict';
import {
  bearingDegrees,
  createCandidateGeometry,
  deriveHeadingFromMovement,
  headingDeltaDegrees,
  validateMovementContext,
} from '../src/services/aheadDiscoveryGeometry';
import type { MovementContext } from '@heycity/shared';

const now = Date.parse('2026-07-25T12:00:00.000Z');
const movement: MovementContext = {
  latitude: 39.7817,
  longitude: -89.6501,
  headingDegrees: 0,
  speedMps: 24,
  accuracyMeters: 12,
  timestamp: new Date(now).toISOString(),
};

assert.equal(validateMovementContext(movement, now), null, 'valid GPS is accepted');
assert.equal(
  validateMovementContext({ ...movement, latitude: 100 }, now),
  'bad_gps',
  'invalid latitude is rejected'
);
assert.equal(
  validateMovementContext({ ...movement, timestamp: new Date(now - 90_000).toISOString() }, now),
  'stale_gps',
  'stale location is rejected'
);
assert.equal(
  validateMovementContext({ ...movement, headingDegrees: null }, now),
  'missing_heading',
  'missing heading is surfaced'
);

const ahead = createCandidateGeometry(movement, { latitude: 39.9, longitude: -89.6501 });
assert.equal(ahead.isAhead, true, 'candidate directly ahead is ahead');
assert(ahead.headingDeltaDegrees < 5, 'candidate directly ahead has low heading delta');

const behind = createCandidateGeometry(movement, { latitude: 39.65, longitude: -89.6501 });
assert.equal(behind.isAhead, false, 'candidate behind is excluded by geometry');
assert(behind.headingDeltaDegrees > 150, 'candidate behind has high heading delta');

assert.equal(headingDeltaDegrees(355, 5), 10, 'heading wraparound near 0/360 works');
assert(Math.round(bearingDegrees(39.7817, -89.6501, 39.9, -89.6501)) === 0, 'bearing north is zero');
assert(ahead.distanceMeters > 0, 'distance calculation produces meters');

const derived = deriveHeadingFromMovement(
  { ...movement, latitude: 39.78, longitude: -89.65, headingDegrees: null },
  { ...movement, latitude: 39.79, longitude: -89.65, headingDegrees: null }
);
assert(derived !== null && derived < 5, 'missing native heading derives from consecutive points');

console.log('aheadDiscoveryGeometry tests passed');
