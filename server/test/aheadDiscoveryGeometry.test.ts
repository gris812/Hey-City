import assert from 'node:assert/strict';
import {
  bearingDegrees,
  createCandidateGeometry,
  deriveHeadingFromMovement,
  headingDeltaDegrees,
  validateMovementContext,
} from '../src/services/aheadDiscoveryGeometry';
import type { MovementContext } from '@heycity/shared';
import { discoverySearchProfile } from '../src/services/discoverySearchProfile';

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

const walking = { ...movement, speedMps: 1 };
const urban = { ...movement, speedMps: 11 };
const beside = { latitude: movement.latitude, longitude: movement.longitude + 0.01 };
assert.equal(createCandidateGeometry(walking, { latitude: 39.77, longitude: -89.65 }).isAhead, true, 'walking searches behind as well as ahead');
assert.equal(createCandidateGeometry(urban, beside).isAhead, true, 'urban driving retains a landmark beside the street');
assert.equal(createCandidateGeometry(movement, beside).isAhead, false, 'highway keeps a forward corridor');
assert.equal(discoverySearchProfile(walking).projectionMeters, 0);
assert.equal(discoverySearchProfile(urban).projectionMeters, 1500);
assert.equal(discoverySearchProfile(urban).rankPreference, 'DISTANCE');
assert.equal(discoverySearchProfile(movement).rankPreference, 'POPULARITY');
