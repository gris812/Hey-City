import assert from 'node:assert/strict';
import { StoryAvailabilityCache } from '../src/features/live/storyAvailabilityCache';
import { canOpenDriveDetails, driveCategory, drivePlace, drivePlaceAction, driveStory, shouldUseDrivePresentation } from '../src/presentation/driveView';
import { explorePlaybackTarget, type StoryPlaybackIdentity } from '../src/presentation/livePresentation';
import { selectionFailurePresentation, ExplicitStorySelection, type StoryChoice, type SelectionDependencies } from '../src/features/live/explicitStorySelection';
import { readPreferences, persistPreferences } from '../src/context/preferenceStorage';
import { createMeasurementFormatter } from '../src/localization/measurements';
import { MapCameraController, nearestHeading, cameraReliability, markersInViewport } from '../src/presentation/mapCamera';
import { ExplorationWakeLock, shouldKeepExplorationAwake } from '../src/features/live/explorationWakeLock';
import type { SelectedStoryResult } from '@heycity/shared';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

async function selections() {
  assert.deepEqual(selectionFailurePresentation('request',422),{kind:'evidence',playbackState:'idle'});
  assert.deepEqual(selectionFailurePresentation('request',503),{kind:'generation',playbackState:'idle'});
  assert.deepEqual(selectionFailurePresentation('stop'),{kind:'playback',playbackState:'error'});
  const controller = new ExplicitStorySelection();
  const log: string[] = [], keys: string[] = [];
  const pending: Record<string, (result: SelectedStoryResult) => void> = {};
  const choice = (id: string): StoryChoice => ({ sessionId: 'session', poiId: id, name: id, latitude: 1, longitude: 2, level: 'short', language: 'en' });
  const result = (id: string): SelectedStoryResult => ({ poiId: id, name: id, momentId: `moment-${id}`, audioUrl: 'audio', transcriptText: 'story', guideId: 'dana', level: 'short', language: 'en', availability: { short: true, long: false } });
  const deps: SelectionDependencies = {
    stopPlayback: async () => { log.push('stop-audio'); },
    request: (selected, key, signal) => { log.push(`request-${selected.poiId}`); keys.push(key); signal.addEventListener('abort', () => log.push(`abort-${selected.poiId}`)); return new Promise(resolve => { pending[selected.poiId] = resolve; }); },
    preparing: selected => { log.push(`preparing-${selected.poiId}`); },
    selected: async (selected, response) => { log.push(`play-${response.poiId}`); assert.equal(selected.poiId, response.poiId); },
    failed: selected => { log.push(`failed-${selected.poiId}`); },
  };
  const first = controller.select(choice('B'), deps);
  await flush();
  await controller.select(choice('B'), deps);
  assert.equal(keys.length, 1, 'double tap shares one preparation/request/charge');
  const next = controller.select(choice('A'), deps);
  await flush();
  assert.ok(log.includes('abort-B'));
  pending.B(result('B'));
  await first;
  assert.ok(!log.includes('play-B'), 'late response from B never starts after choosing A');
  pending.A(result('A'));
  await next;
  assert.ok(log.indexOf('stop-audio') < log.indexOf('request-B'));
  assert.ok(log.includes('play-A'));
  await controller.select(choice('A'), deps);
  assert.equal(keys.length, 2, 'repeated play/pause selection does not regenerate');
  assert.equal(controller.holdsAutomaticNarration, true, 'automatic ping must not take over explicit audio');
  controller.retryAfterAudioFailure();
  const retry = controller.select(choice('A'), deps);
  await retry;
  assert.equal(keys.length, 2, 'audio retry reuses delivered response without regeneration or another charge');
  assert.equal(new Set(keys).size, 2);
  const old = controller.select(choice('C'), deps);
  await flush(); controller.cancel(); pending.C(result('C')); await old;
  assert.ok(!log.includes('play-C'), 'session stop ignores even a transport that cannot abort');
  assert.equal(controller.holdsAutomaticNarration, false);
  await controller.select(choice('unavailable'), {
    ...deps,
    request: async () => { throw new Error('422'); },
    failed: (_selected, _error, stage) => assert.equal(stage, 'request'),
  });
  assert.equal(controller.holdsAutomaticNarration, false, 'a failed request without media releases automatic narration');
  controller.cancel();
  assert.equal(controller.holdsAutomaticNarration, false);
}

function availabilityCache() {
  const cache = new StoryAvailabilityCache();
  assert.equal(cache.state('a'), 'unknown');
  assert(cache.observeRevision('v1'));
  cache.record('a', 'short', 'unavailable', 100, 1000);
  assert.equal(cache.state('a', 'short', 1099), 'unavailable');
  assert.equal(cache.state('b', 'short', 1099), 'unknown');
  assert.equal(cache.state('a', 'long', 1099), 'unknown');
  assert.equal(cache.state('a', 'short', 1100), 'unknown');
  assert(cache.expire(1100));
  cache.record('a', 'short', 'ready');
  cache.record('a', 'long', 'unavailable');
  assert.equal(cache.state('a'), 'ready');
  assert.equal(cache.state('a', 'long'), 'unavailable');
  assert(!cache.observeRevision('v1'));
  assert(cache.observeRevision('v2'));
  assert.equal(cache.state('a'), 'unknown');
}
availabilityCache();

function exploreCardPlayback() {
  const playback = {
    sessionId: 'session', momentId: 'moment', poiId: 'new-story', guideId: 'dana' as const,
    target: { name: 'Current story', latitude: 43.7, longitude: -93 },
  };
  assert.equal(explorePlaybackTarget({ playback, playbackState: 'playing' })?.id, 'new-story');
  assert.equal(explorePlaybackTarget({ playback, playbackState: 'paused' })?.id, 'new-story');
  assert.equal(explorePlaybackTarget({ playback, playbackState: 'completed' }), undefined);
  assert.equal(explorePlaybackTarget({ playback, playbackState: 'error' }), undefined);
}
exploreCardPlayback();

async function units() {
  const data = new Map<string, string>();
  const store = { getItemAsync: async (key: string) => data.get(key) ?? null, setItemAsync: async (key: string, value: string) => { data.set(key, value); } };
  const initial = await readPreferences(store, 'ru');
  assert.equal(initial.measurementUnits, 'metric');
  await persistPreferences(store, { ...initial, measurementUnits: 'imperial', appLanguage: 'ru', guideLanguage: 'en' });
  const restart = await readPreferences(store, 'en');
  assert.equal(restart.measurementUnits, 'imperial', 'same persistence is used before and after authentication');
  assert.equal(restart.appLanguage, 'ru'); assert.equal(restart.guideLanguage, 'en');
  await persistPreferences(store, { ...restart, appLanguage: 'en', guideLanguage: 'ru' });
  assert.equal((await readPreferences(store, 'ru')).measurementUnits, 'imperial', 'language does not choose display units');
  for (const locale of ['ru', 'en'] as const) {
    const imperial = createMeasurementFormatter('imperial', locale), metric = createMeasurementFormatter('metric', locale);
    assert.match(imperial.distance(1609.344), /1[.,]0 mi$/);
    assert.match(imperial.distance(30.48), /100 ft$/);
    assert.match(imperial.speed(112.65408), /70[.,]0 mph$/);
    assert.match(metric.speed(112.65408), locale === 'ru' ? /112,7 км\/ч$/ : /112.7 km\/h$/);
    assert.equal(imperial.speed(null), '—'); assert.equal(metric.distance(-1), '—');
  }
  data.delete('pref_measurement_units');
  assert.equal((await readPreferences(store, 'en')).measurementUnits, 'metric', 'old installations migrate without changing language');
}

function camera() {
  assert.equal(nearestHeading(359, 1), 361, 'north crossing takes two degrees');
  assert.equal(nearestHeading(1, 359), -1);
  const map = new MapCameraController(); const position = { latitude: 1, longitude: 2 };
  assert.equal(map.orientation, 'course-up');
  assert.equal(map.update(position, { heading: 359, speedKmh: 60, timestampMs: 1000 }, 1000)?.heading, -1);
  assert.equal(map.update(position, { heading: 1, speedKmh: 60, timestampMs: 2000 }, 2000)?.heading, 1);
  map.update(position, { heading: 180, speedKmh: 60, timestampMs: 1500 }, 2001);
  assert.equal(map.heading, 1, 'late course cannot replace a newer fix');
  map.update(position, { heading: 180, speedKmh: 60, timestampMs: 2500, accuracyMeters: 500 }, 2500);
  assert.equal(map.heading, 1, 'inaccurate GPS cannot turn the camera');
  map.pan();
  const manual = map.update({ latitude: 2, longitude: 3 }, { heading: 90, speedKmh: 50, timestampMs: 3000 }, 3000);
  assert.equal(manual?.center, undefined, 'GPS does not recenter a panned map');
  map.toggleOrientation();
  assert.equal(map.following, false, 'orientation toggle is independent of follow');
  assert.equal(map.update(position, null, 3000)?.center, undefined);
  map.follow();
  assert.deepEqual(map.update(position, null, 3000)?.center, position);
  map.toggleOrientation();
  map.update(position, { heading: 180, speedKmh: 0, timestampMs: 4000 }, 4000);
  assert.equal(map.heading, 90, 'stationary GPS heading cannot spin the map');
  map.update(position, { heading: 10, speedKmh: 80, timestampMs: 1000 }, 3001 + cameraReliability.maxCourseAgeMs);
  assert.equal(map.reliableCourse, false); assert.equal(map.heading, 0, 'stale course falls back to north without changing preference');
  assert.equal(map.orientation, 'course-up');
}

function drivingCameraReplay() {
  const map = new MapCameraController();
  const start = { latitude: 42, longitude: -96 };
  const fix = (timestampMs: number, latitude: number, heading: number, speedKmh = 100, accuracyMeters = 10) =>
    ({ ...start, latitude, heading, speedKmh, timestampMs, accuracyMeters });
  const initial = fix(1000, 42, 359);
  const next = fix(3000, 42.0005, 1);
  map.updateVehicle(initial, 1000);
  const incremental = [3000, 3500, 4000, 4500, 5000]
    .map(time => map.updateVehicle(next, time)?.center?.latitude)
    .filter((latitude): latitude is number => latitude !== undefined);
  assert.equal(incremental.at(-1), next.latitude);
  let last = initial.latitude;
  const peakStep = Math.max(...incremental.map(latitude => {
    const step = Math.abs(latitude - last);
    last = latitude;
    return step;
  }));
  assert(peakStep < (next.latitude - initial.latitude) / 2);
  const turn = map.updateVehicle(fix(5500, 42.0006, 95), 5500);
  assert(turn && Math.abs(nearestHeading(1, turn.heading) - 1) <= 24);
  assert.equal(map.updateVehicle(fix(5600, 51, 180), 5600), undefined, 'one automatic camera command per tick');
  assert((map.updateVehicle(fix(6000, 60, 180, 100, 500), 6000)?.center?.latitude ?? start.latitude) < 42.001,
    'poor accuracy and an implausible accurate jump cannot move the camera far from the route');
  const stop = fix(7500, 42.0006, 220, 0);
  map.updateVehicle(stop, 7500);
  const stopped = map.updateVehicle(stop, 9500)?.center;
  assert(stopped && Math.abs(stopped.latitude - stop.latitude) < 0.00001);
  assert.equal(map.updateVehicle(fix(10000, 42.00061, 180, 0), 10000)?.center, undefined, 'stopped GPS jitter frozen');
  assert.equal(map.updateVehicle(undefined, 20000)?.center, undefined, 'lost GPS does not predict motion');
  map.pan();
  assert.equal(map.updateVehicle(fix(20500, 42.001, 0), 20500), undefined);
  map.toggleOrientation();
  const manualNorth = map.updateVehicle(undefined, 20500);
  assert.equal(manualNorth?.center, undefined, 'compass preserves manual pan');
  assert.equal(manualNorth?.heading, 0, 'manual compass completes even while automatic camera is paused');
  map.follow();
  assert(map.updateVehicle(undefined, 20500)?.center);
  const bounds = { latitude: 42, longitude: 179.999, latitudeDelta: 0.02, longitudeDelta: 0.02 };
  assert.deepEqual(markersInViewport([
    { id: 'near', coordinate: { latitude: 42, longitude: -179.999 } },
    { id: 'far', coordinate: { latitude: 43, longitude: 179.999 } },
  ], bounds).map(marker => marker.id), ['near']);
  console.log(JSON.stringify({ replay: 'synthetic vehicle route', oldPeakCenterStepM: Math.round((next.latitude - initial.latitude) * 111195),
    newPeakCenterStepM: Math.round(peakStep * 111195), oldHeadingStepDeg: 94, newHeadingStepLimitDeg: 24 }));
}

async function wake() {
  const state = { focused: true, foreground: true, scenario: 'city_explorer', sessionActive: true, tourState: 'idle', tourPaused: false };
  assert.ok(shouldKeepExplorationAwake(state));
  for (const patch of [{ foreground: false }, { focused: false }, { sessionActive: false }]) assert.equal(shouldKeepExplorationAwake({ ...state, ...patch }), false);
  assert.equal(shouldKeepExplorationAwake({ ...state, scenario: 'guided_tour', tourState: 'completed' }), false);
  assert.equal(shouldKeepExplorationAwake({ ...state, scenario: 'guided_tour', tourState: 'narrating', tourPaused: true }), false);
  const log: string[] = []; let release!: () => void;
  const lock = new ExplorationWakeLock({ activate: async () => { log.push('activate'); await new Promise<void>(resolve => { release = resolve; }); }, deactivate: async () => { log.push('deactivate'); }, failed: () => { throw new Error('unexpected wake error'); } });
  const activation = lock.setEnabled(true); await flush();
  const teardown = lock.dispose(); release(); await activation; await teardown;
  assert.deepEqual(log, ['activate', 'deactivate'], 'late activation cannot leave screen awake after teardown');
  await lock.setEnabled(true); assert.equal(log.length, 2, 'disposed owner cannot reacquire');
  const normal: string[] = [];
  const other = new ExplorationWakeLock({ activate: async () => { normal.push('on'); }, deactivate: async () => { normal.push('off'); }, failed: () => {} });
  await other.setEnabled(true); await other.setEnabled(true); await other.setEnabled(false); await other.dispose();
  assert.deepEqual(normal, ['on', 'off'], 'stop/background releases exactly once');
}

function drivePresentation() {
  assert.equal(shouldUseDrivePresentation('vehicle', true), true);
  assert.equal(shouldUseDrivePresentation('walking', true), false);
  assert.equal(shouldUseDrivePresentation(undefined, true), true, 'active session awaiting motion stays compact');
  assert.equal(shouldUseDrivePresentation(undefined, false), false);
  assert.equal(drivePlace({}), undefined);
  assert.deepEqual(drivePlace({ nearby: 'marker' }), { relation: 'nearby', place: 'marker' });
  assert.deepEqual(drivePlace({ ahead: 'A', nearby: 'B' }), { relation: 'ahead', place: 'A' });
  assert.deepEqual(drivePlace({ pinned: 'B', ahead: 'A' }), { relation: 'pinned', place: 'B' });
  assert.deepEqual(drivePlace({ selected: 'C', pinned: 'B', ahead: 'A' }), { relation: 'selected', place: 'C' });
  assert.equal(driveCategory('historical_landmark'), 'historic');
  assert.equal(driveCategory('unsupported_place_type'), 'place');
  assert.equal(drivePlaceAction('unknown'), true);
  assert.equal(drivePlaceAction('ready'), true);
  assert.equal(drivePlaceAction('checking'), false);
  assert.equal(drivePlaceAction('unavailable'), false);

  const title = 'Национальный историко-культурный музей-заповедник промышленной истории';
  const playback: StoryPlaybackIdentity = {
    sessionId: 'session', poiId: 'B', momentId: 'moment', guideId: 'dana',
    target: { name: title }, transcript: 'Story B',
  };
  assert.equal(driveStory({ playbackState: 'playing' }), undefined, 'no playback identity means no audio card');
  assert.equal(driveStory({ playbackState: 'preparing', playback, audioProgress: 0.77 })?.progress, undefined);
  assert.equal(driveStory({ playbackState: 'loading', playback })?.transportActive, false);
  assert.deepEqual(driveStory({ playbackState: 'playing', playback, audioProgress: 0.61 }), {
    title, guideId: 'dana', phase: 'playing', transportActive: true, hasText: true, progress: 61,
  });
  assert.equal(driveStory({ playbackState: 'paused', playback })?.transportActive, true);
  assert.equal(driveStory({ playbackState: 'error', playback, audioProgress: 0.61 })?.progress, undefined);
  assert.equal(driveStory({ playbackState: 'text_only', playback })?.hasText, true);
  assert.equal(driveStory({ playbackState: 'completed', playback }), undefined, 'old moment cannot keep the card');
  assert.equal(driveStory({ playbackState: 'playing', playback: { ...playback, guideId: 'arthur' } })?.guideId, 'arthur');

  const fix = { heading: null, speedKmh: 0, timestampMs: 10_000, accuracyMeters: 12 };
  assert.equal(canOpenDriveDetails(null, 10_001), false);
  assert.equal(canOpenDriveDetails(fix, 10_001), true, 'stationary does not require course');
  assert.equal(canOpenDriveDetails(fix, 18_000), false);
  assert.equal(canOpenDriveDetails({ ...fix, speedKmh: null }, 10_001), false);
  assert.equal(canOpenDriveDetails({ ...fix, speedKmh: 3 }, 10_001), false);
  assert.equal(canOpenDriveDetails({ ...fix, accuracyMeters: 32 }, 10_001), false);
}

void (async () => { drivePresentation(); await selections(); await units(); camera(); drivingCameraReplay(); await wake(); console.log('native selection, units persistence, camera and keep-awake behavioral regressions passed'); })();
