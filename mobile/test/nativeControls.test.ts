import assert from 'node:assert/strict';
import { ExplicitStorySelection, type StoryChoice, type SelectionDependencies } from '../src/features/live/explicitStorySelection';
import { readPreferences, persistPreferences } from '../src/context/preferenceStorage';
import { createMeasurementFormatter } from '../src/localization/measurements';
import { MapCameraController, nearestHeading, cameraReliability } from '../src/presentation/mapCamera';
import { ExplorationWakeLock, shouldKeepExplorationAwake } from '../src/features/live/explorationWakeLock';
import type { SelectedStoryResult } from '@heycity/shared';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

async function selections() {
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
}

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
  map.toggleOrientation();
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
void (async () => { await selections(); await units(); camera(); await wake(); console.log('native selection, units persistence, camera and keep-awake behavioral regressions passed'); })();
