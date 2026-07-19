import { mapDriveSessionToPresentation } from '../src/presentation/mapDriveSessionToPresentation';
import type { PingResult } from '../src/api/drive';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertTruthy(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

const playResult: PingResult = {
  nextAction: 'PLAY',
  poi: {
    place_id: 'poi_federal_hall',
    name: 'Federal Hall',
    geometry: { location: { lat: 40.707, lng: -74.01 } },
  },
  textPreview: 'Federal Hall is waiting just ahead.',
  decision: {
    type: 'trigger_story',
    poiId: 'poi_federal_hall',
    triggerReason: 'distance',
    distanceMeters: 80,
    mode: 'vehicle',
    narrativePlanInput: {
      poiId: 'poi_federal_hall',
      placeName: 'Federal Hall',
      mode: 'vehicle',
      guideId: 'arthur',
      themeTags: ['history'],
      targetDurationSec: 40,
    },
  },
  narrativePlan: {
    poiId: 'poi_federal_hall',
    placeName: 'Federal Hall',
    mode: 'vehicle',
    guideId: 'arthur',
    themeTags: ['history'],
    targetDurationSec: 40,
    safety: { vehicleSafe: true, maxDurationSec: 45, visualLoad: 'minimal' },
    structure: ['hook', 'context', 'fact', 'closing'],
  },
};

const playing = mapDriveSessionToPresentation(playResult, {
  sessionActive: true,
  playbackState: 'idle',
});
const playingAgain = mapDriveSessionToPresentation(playResult, {
  sessionActive: true,
  playbackState: 'idle',
});

assertDeepEqual(playingAgain, playing, 'same input maps deterministically');
assertEqual(playing.discoveryPhase, 'target_active', 'PLAY result activates target phase');
assertEqual(playing.playbackState, 'playing', 'PLAY result maps to playing');
assertEqual(playing.presentationMode, 'map', 'current backend contract stays map-first');
assertEqual(playing.activeGuideId, 'arthur', 'guide id comes from backend plan');
assertEqual(playing.activeTarget?.name, 'Federal Hall', 'active target comes from backend POI');
assertEqual(playing.activeTarget?.latitude, 40.707, 'target latitude is preserved');

const paused = mapDriveSessionToPresentation(playResult, {
  sessionActive: true,
  playbackState: 'paused',
  audioProgress: 0.35,
});

assertEqual(paused.playbackState, 'paused', 'local pause overrides backend PLAY rendering');
assertEqual(paused.audioProgress, 0.35, 'local audio progress is preserved');
assertEqual(paused.activeGuideId, 'arthur', 'local pause does not alternate guide');

const holding = mapDriveSessionToPresentation(
  {
    nextAction: 'NONE',
    decision: { type: 'hold', reason: 'cooldown_active' },
  },
  {
    sessionActive: true,
    playbackState: 'idle',
  }
);

assertEqual(holding.discoveryPhase, 'holding', 'hold decision maps to holding');
assertEqual(holding.holdReason, 'cooldown_active', 'hold reason is exposed');
assertEqual(holding.presentationMode, 'map', 'holding stays map-first');

const idle = mapDriveSessionToPresentation(null, {
  sessionActive: false,
  playbackState: 'playing',
});

assertEqual(idle.discoveryPhase, 'idle', 'inactive session maps to idle');
assertEqual(idle.playbackState, 'idle', 'inactive session clears playback');
assertTruthy(!idle.activeTarget, 'inactive session has no active target');

const longTranscript = 'a'.repeat(220);
const truncated = mapDriveSessionToPresentation(
  {
    ...playResult,
    transcriptText: longTranscript,
  },
  {
    sessionActive: true,
    playbackState: 'idle',
  }
);

assertEqual(truncated.transcriptPreview?.length, 180, 'long transcript is safely truncated');
assertEqual(
  truncated.transcriptPreview?.endsWith('...'),
  true,
  'truncated transcript includes ellipsis'
);
assertEqual(truncated.activeTarget?.id, 'poi_federal_hall', 'mapper copies target id');
assertEqual(truncated.activeTarget?.name, 'Federal Hall', 'mapper copies target name');

console.log('mapDriveSessionToPresentation tests passed');
