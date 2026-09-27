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
}

void run();
