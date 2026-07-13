import assert from 'node:assert/strict';
import {
  getPingSkipReason,
  shouldRefreshCandidates,
  shouldTriggerStory,
} from '../src/services/driveDecision';
import { driveDiscovery, speedThresholds } from '../src/config';

assert.equal(
  getPingSkipReason({
    circuitOpen: true,
    muted: false,
    speedKmh: speedThresholds.minVehicleKmh + 1,
  }),
  'circuit_open'
);

assert.equal(
  getPingSkipReason({
    circuitOpen: false,
    muted: true,
    speedKmh: speedThresholds.minVehicleKmh + 1,
  }),
  'muted'
);

assert.equal(
  getPingSkipReason({
    circuitOpen: false,
    muted: false,
    speedKmh: speedThresholds.minVehicleKmh - 1,
  }),
  'below_vehicle_speed'
);

assert.equal(
  getPingSkipReason({
    circuitOpen: false,
    muted: false,
    speedKmh: speedThresholds.minVehicleKmh,
  }),
  null
);

assert.equal(
  shouldRefreshCandidates({
    nowMs: 1000,
    lastPlacesAtMs: 0,
    canMakePlacesCall: true,
    hasCachedCandidates: false,
  }),
  true
);

assert.equal(
  shouldRefreshCandidates({
    nowMs: 1000,
    lastPlacesAtMs: 0,
    canMakePlacesCall: false,
    hasCachedCandidates: false,
  }),
  false
);

assert.equal(
  shouldRefreshCandidates({
    nowMs: 1000,
    lastPlacesAtMs: 0,
    canMakePlacesCall: true,
    hasCachedCandidates: true,
  }),
  false
);

assert.equal(
  shouldRefreshCandidates({
    nowMs: driveDiscovery.placesRefreshSec * 1000 + 1,
    lastPlacesAtMs: 0,
    canMakePlacesCall: true,
    hasCachedCandidates: true,
  }),
  true
);

assert.equal(
  shouldTriggerStory({
    etaSec: driveDiscovery.minEtaSecToStart - 1,
    leadTimeSec: 120,
    lastStoryStartedAtMs: 0,
    nowMs: 10000,
  }),
  false
);

assert.equal(
  shouldTriggerStory({
    etaSec: 121,
    leadTimeSec: 120,
    lastStoryStartedAtMs: 0,
    nowMs: 10000,
  }),
  false
);

assert.equal(
  shouldTriggerStory({
    etaSec: 60,
    leadTimeSec: 120,
    lastStoryStartedAtMs: 9000,
    nowMs: 10000,
  }),
  false
);

assert.equal(
  shouldTriggerStory({
    etaSec: 60,
    leadTimeSec: 120,
    lastStoryStartedAtMs: 0,
    nowMs: 10000,
  }),
  true
);

console.log('driveDecision tests passed');

