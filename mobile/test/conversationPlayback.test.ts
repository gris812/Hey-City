import assert from 'node:assert/strict';
import { ConversationPlayback, isCurrentConversationTurn, type StoryAudioPort } from '../src/features/live/conversationPlayback';

function fakeAudio(log: string[], positionMillis = 12000): StoryAudioPort {
  return {
    getStatusAsync: async () => { log.push('status'); return { positionMillis }; },
    pauseAsync: async () => { log.push('pause'); return { positionMillis }; },
    playAsync: async () => { log.push('play'); },
    unloadAsync: async () => { log.push('unload'); },
  };
}

async function run() {
  const log: string[] = [];
  const playback = new ConversationPlayback();
  playback.attach('m-1', 'https://audio/original.mp3', fakeAudio(log));
  const suspended = await playback.pauseForConversation();
  assert.deepEqual(suspended, { momentId: 'm-1', audioUrl: 'https://audio/original.mp3', positionMillis: 12000 });
  assert.deepEqual(log, ['pause'], 'local audio pauses before any conversation transport is started');
  assert.equal(await playback.resumeOriginal('m-2'), false, 'a different moment cannot resume this audio');
  assert.equal(await playback.resumeOriginal('m-1'), true, 'resume uses the original sound and saved position');
  assert.deepEqual(log, ['pause', 'play']);
  await playback.clear();
  assert.deepEqual(log, ['pause', 'play', 'unload'], 'cleanup unloads local audio');
  assert.equal(isCurrentConversationTurn('s-1', 2, 's-1', 2), true);
  assert.equal(isCurrentConversationTurn('s-1', 1, 's-1', 2), false, 'a superseded response is ignored');
  assert.equal(isCurrentConversationTurn('s-1', 2, 's-2', 2), false, 'a response from an ended session is ignored');

  const outcomes: string[] = [];
  const state = (value: string) => outcomes.push(value);
  const story = (momentId: string) => ({ sessionId: 's-1', momentId, poiId: momentId, guideId: 'dana' as const, target: { id: momentId, name: momentId } });
  const deps = { onState: state, onEnded: () => state('ended'), onError: state };
  await playback.loadStory(story('text'), undefined, { ...deps, create: async () => { throw new Error('unexpected player'); } });
  assert.deepEqual(outcomes.splice(0), ['text_only', 'audio_missing']);
  await playback.loadStory(story('failed'), 'https://audio/broken.mp3', { ...deps, create: async () => ({
    ...fakeAudio(log),
    playAsync: async () => { throw new Error('load failed'); },
    unloadAsync: async () => { throw new Error('stale native handle'); },
  }) });
  assert(outcomes.includes('error'));
  for (let i = 0; i < 5; i++) {
    const before = outcomes.filter(outcome => outcome === 'ended').length;
    await playback.loadStory(story(`good-${i}`), 'https://audio/good.mp3', { ...deps, create: async (_url, notify) => ({
      ...fakeAudio(log),
      playAsync: async () => {
        notify({ isLoaded: true, isPlaying: true });
        notify({ isLoaded: true, didJustFinish: true });
        notify({ isLoaded: true, didJustFinish: true });
      },
    }) });
    assert.equal(outcomes.filter(outcome => outcome === 'ended').length, before + 1);
  }

}

void run();
