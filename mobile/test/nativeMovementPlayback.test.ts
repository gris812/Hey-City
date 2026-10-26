import assert from 'node:assert/strict';
import { ConversationPlayback, type NativeStoryStatus, type StoryAudioPort, type StoryPlaybackDependencies } from '../src/features/live/conversationPlayback';
import { gpsSpeedKmh } from '../src/features/live/motion';
import { mapDriveSessionToPresentation } from '../src/presentation/mapDriveSessionToPresentation';
import type { PlaybackState, StoryPlaybackIdentity } from '../src/presentation/livePresentation';

function story(id: string, sessionId = 'session'): StoryPlaybackIdentity {
  return { sessionId, momentId: `moment-${id}`, poiId: id, guideId: 'arthur', target: { id, name: `Place ${id}` }, transcript: `Story ${id}` };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function run() {
  assert.ok(Math.abs(gpsSpeedKmh(70 * 0.44704)! - 112.65408) < 0.00001);
  for (const speed of [null, undefined, -1, NaN, Infinity]) assert.equal(gpsSpeedKmh(speed), null);
  assert.equal(gpsSpeedKmh(0), 0, 'real zero is retained');
  const player = new ConversationPlayback();
  const listeners: Record<string, (s: NativeStoryStatus) => void> = {};
  const ended: string[] = [], errors: string[] = [], played: string[] = [], unloaded: string[] = [];
  let state: PlaybackState = 'idle';
  let active: StoryPlaybackIdentity | undefined;
  const deps: StoryPlaybackDependencies = {
    create: async (url, listener) => {
      listeners[url] = listener;
      return { pauseAsync: async () => { listener({ isLoaded: true, isPlaying: false }); return {}; },
        playAsync: async () => { played.push(url); }, unloadAsync: async () => { unloaded.push(url); }, getStatusAsync: async () => ({}) };
    },
    onState: (s, current) => { state = s; active = current; },
    onEnded: current => ended.push(current.momentId), onError: code => errors.push(code),
  };
  await player.loadStory(story('B'), 'B', deps);
  assert.equal(state, 'loading', 'PLAY and playAsync do not prove audible playback');
  listeners.B({ isLoaded: true, isPlaying: true });
  assert.equal(state, 'playing');
  const presentation = mapDriveSessionToPresentation({ nextAction: 'NONE', mode: 'vehicle',
    poi: { place_id: 'A', name: 'Priority A', geometry: { location: { lat: 0, lng: 0 } } } },
    { sessionActive: true, playbackState: state, playback: active, movementMode: 'vehicle' });
  assert.equal(presentation.activeTarget?.id, 'B', 'Discovery A cannot steal playback B');
  assert.equal(presentation.playback?.guideId, 'arthur');
  assert.equal(presentation.transcriptPreview, 'Story B');
  assert.equal(presentation.movementMode, 'vehicle');
  assert.notEqual(presentation.playback?.poiId, 'A', 'A cannot show a speaking badge');
  listeners.B({ isLoaded: true, didJustFinish: true });
  listeners.B({ isLoaded: true, didJustFinish: true });
  assert.deepEqual(ended, ['moment-B'], 'one natural end produces one completion');
  await player.loadStory(story('C'), 'C', deps);
  listeners.B({ isLoaded: true, isPlaying: true, didJustFinish: true });
  assert.equal(state, 'loading', 'old callbacks cannot alter another moment');
  listeners.C({ isLoaded: false, error: 'private URL/transcript must not be logged' });
  assert.equal(state, 'error');
  listeners.C({ isLoaded: true, didJustFinish: true });
  assert.deepEqual(ended, ['moment-B'], 'media failure never creates completion');
  await player.loadStory(story('D'), undefined, deps);
  assert.equal(state, 'text_only');
  assert.deepEqual(ended, ['moment-B']);
  let deliver!: (audio: StoryAudioPort) => void;
  const pending = player.loadStory(story('E'), 'E', { ...deps,
    create: async (_url, listener) => { listeners.E = listener; return new Promise(resolve => { deliver = resolve; }); } });
  await flush();
  await player.loadStory(story('F'), 'F', deps);
  deliver({ playAsync: async () => { played.push('E'); }, unloadAsync: async () => { unloaded.push('E'); }, pauseAsync: async () => ({}), getStatusAsync: async () => ({}) });
  await pending;
  listeners.E({ isLoaded: true, isPlaying: true, didJustFinish: true });
  assert.ok(!played.includes('E'), 'late-created old audio never starts');
  assert.ok(unloaded.includes('E'));
  assert.equal(active?.poiId, 'F');
  listeners.F({ isLoaded: true, didJustFinish: true });
  assert.equal(state, 'error', 'ending without a confirmed start is an error');
  await player.clear();
  listeners.F({ isLoaded: true, isPlaying: true, didJustFinish: true });
  assert.deepEqual(ended, ['moment-B']);
  assert.ok(errors.includes('audio_missing'));
  console.log('native movement/playback behavioral regressions passed');
}
void run();
