import assert from 'node:assert/strict';
import { GeminiLiveCodec } from '../src/features/live/geminiLiveCodec';

function run(): void {
  const codec = new GeminiLiveCodec();
  codec.configure({ providerId: 'gemini', generation: 7 });
  assert.equal(codec.decode(JSON.stringify({ setupComplete: {} }))[0]?.type, 'setup_complete');

  const preAuthorityAudio = codec.decode(JSON.stringify({
    serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/pcm;rate=24000' } }] } },
  }));
  assert.equal(preAuthorityAudio.some(item => item.type === 'audio'), false,
    'provider output before the approved M3 answer is never played');

  const inputEvents = codec.decode(JSON.stringify({
    serverContent: {
      inputTranscription: { text: 'Where can I get coffee nearby?' },
      turnComplete: true,
    },
  }));
  const userTurn = inputEvents.find(item => item.type === 'client_event' && item.event.type === 'user_turn');
  assert.equal(userTurn?.type === 'client_event' && userTurn.event.type === 'user_turn'
    ? userTurn.event.turn.text : undefined, 'Where can I get coffee nearby?');

  const command = codec.encodeCommand({
    type: 'speak_grounded_answer', voiceTurnId: 'voice-7', text: 'Grounded answer.', renderingInstructions: 'Exact.',
  });
  assert.equal(Object.hasOwn(command ?? {}, 'clientContent'), true);
  const audioEvents = codec.decode(JSON.stringify({
    serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/pcm;rate=24000' } }] } },
  }));
  assert.equal(audioEvents.some(item => item.type === 'audio' && item.sampleRate === 24_000), true);
  assert.equal(audioEvents.some(item => item.type === 'client_event' && item.event.type === 'response_started'), true);

  const transcript = codec.decode(JSON.stringify({
    serverContent: { outputTranscription: { text: 'Grounded answer.' } },
  }));
  assert.equal(transcript.some(item => item.type === 'client_event' && item.event.type === 'output_transcript'), true);
  const completed = codec.decode(JSON.stringify({
    usageMetadata: {
      promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 12 }],
      responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 9 }],
    },
    serverContent: { turnComplete: true },
  }));
  const done = completed.find(item => item.type === 'client_event' && item.event.type === 'response_completed');
  assert.equal(done?.type === 'client_event' && done.event.type === 'response_completed'
    ? done.event.usage?.inputAudioTokens : undefined, 12);
  assert.equal(done?.type === 'client_event' && done.event.type === 'response_completed'
    ? done.event.usage?.outputAudioTokens : undefined, 9);
  console.log('Gemini Live codec: M3 authority, PCM and measured usage contract passed');
}

run();
