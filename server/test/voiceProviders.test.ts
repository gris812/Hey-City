import assert from 'node:assert/strict';
import type { SpeechProvider } from '../src/voice/contracts';
import { realtimePricing } from '../src/config';
import { DeterministicRealtimeConversationProvider } from '../src/voice/deterministicRealtimeProvider';
import { GeminiLiveConversationProvider } from '../src/voice/geminiLiveProvider';
import { OpenAIRealtimeConversationProvider } from '../src/voice/openAIRealtimeProvider';
import { RealtimeProviderRouter } from '../src/voice/realtimeProviderRouter';
import { estimateRealtimeCostUsd, sanitizeRealtimeTelemetryEvent } from '../src/services/usage';
import { generateConversationSpeech, setDefaultSpeechProviderForTests } from '../src/services/narration';
import { encodeGeminiLiveCommands, encodeOpenAIRealtimeCommands } from '../src/voice/clientCommandCodecs';

const baseConfig = {
  sessionId: 'drive-1',
  guideId: 'dana',
  language: 'en',
  voiceProfile: { guideId: 'dana', language: 'en', speakingStyle: ['warm'], pace: 'normal' as const },
  inactivityTimeoutMs: 45_000,
  clientTransport: 'webrtc' as const,
};

async function run(): Promise<void> {
  const deterministic = new DeterministicRealtimeConversationProvider();
  const reference = await deterministic.createSession(baseConfig);
  assert.equal((await reference.issueClientConnection()).connection.kind, 'deterministic');
  await reference.submitAnswer({ voiceTurnId: 'turn-1', text: 'Approved grounded answer.' });
  assert.deepEqual(reference.takeClientCommands()[0], {
    type: 'speak_grounded_answer',
    voiceTurnId: 'turn-1',
    text: 'Approved grounded answer.',
    renderingInstructions: 'Speak the supplied text exactly. Do not add, remove, or change facts.',
  });
  await reference.cancelResponse();
  assert.equal(reference.takeClientCommands()[0].type, 'cancel_response');
  const grounded = [{
    type: 'speak_grounded_answer' as const, voiceTurnId: 'turn-1', text: 'Approved grounded answer.',
    renderingInstructions: 'Speak verbatim.',
  }];
  const openAIEvents = encodeOpenAIRealtimeCommands(grounded);
  assert.equal(openAIEvents[0].type, 'response.create');
  assert(JSON.stringify(openAIEvents).includes('Approved grounded answer.'));
  assert.deepEqual(encodeOpenAIRealtimeCommands([{ type: 'cancel_response' }]).map(event => event.type), [
    'response.cancel', 'output_audio_buffer.clear',
  ]);
  const geminiEvents = encodeGeminiLiveCommands(grounded);
  assert(JSON.stringify(geminiEvents).includes('clientContent'));
  assert(JSON.stringify(geminiEvents).includes('Approved grounded answer.'));
  assert.deepEqual(encodeGeminiLiveCommands([{ type: 'cancel_response' }]), [{ realtimeInput: { activityStart: {} } }]);

  let openAIRequest: { url: string; init?: RequestInit } | undefined;
  const openai = new OpenAIRealtimeConversationProvider({
    apiKey: 'durable-openai-secret', model: 'gpt-realtime-test', connectionTimeoutMs: 1_000,
    maxSessionDurationMs: 60_000,
    fetchImpl: async (input, init) => {
      openAIRequest = { url: String(input), init };
      return new Response('v=0\r\na=answer', { status: 200, headers: { Location: '/v1/realtime/calls/call-test' } });
    },
  });
  const openAISession = await openai.createSession(baseConfig);
  const openAIConnection = await openAISession.issueClientConnection({ clientSdp: 'v=0\r\na=offer' });
  assert.equal(openAIConnection.connection.kind, 'webrtc_answer');
  assert(!JSON.stringify(openAIConnection).includes('durable-openai-secret'), 'durable key never reaches client bootstrap');
  assert.equal(openAIRequest?.url, 'https://api.openai.com/v1/realtime/calls');
  const form = openAIRequest?.init?.body as FormData;
  assert.equal(form.get('sdp'), 'v=0\r\na=offer');
  assert.equal((JSON.parse(String(form.get('session'))) as { audio: { input: { turn_detection: { create_response: boolean } } } }).audio.input.turn_detection.create_response, false);

  let geminiRequest: { init?: RequestInit } | undefined;
  const gemini = new GeminiLiveConversationProvider({
    apiKey: 'durable-gemini-secret', model: 'gemini-live-test', connectionTimeoutMs: 1_000,
    clientCredentialTtlMs: 55_000, maxSessionDurationMs: 60_000,
    fetchImpl: async (_input, init) => {
      geminiRequest = { init };
      return Response.json({ name: 'ephemeral-one-use-token' });
    },
  });
  const geminiSession = await gemini.createSession({ ...baseConfig, clientTransport: 'websocket' });
  const geminiConnection = await geminiSession.issueClientConnection();
  assert.equal(geminiConnection.connection.kind, 'websocket_ephemeral');
  assert(JSON.stringify(geminiConnection).includes('ephemeral-one-use-token'));
  assert(!JSON.stringify(geminiConnection).includes('durable-gemini-secret'));
  const tokenBody = JSON.parse(String(geminiRequest?.init?.body)) as { uses: number; liveConnectConstraints: { model: string } };
  assert.equal(tokenBody.uses, 1);
  assert.equal(tokenBody.liveConnectConstraints.model, 'models/gemini-live-test');

  const router = new RealtimeProviderRouter([openai, gemini, deterministic], 'deterministic');
  assert.deepEqual(router.providerIds().sort(), ['deterministic', 'gemini', 'openai']);
  assert.equal(router.resolve().id, 'deterministic');

  const telemetry = sanitizeRealtimeTelemetryEvent({
    sessionId: 's', provider: 'openai', model: 'm', latencyMs: -10, turnCount: 9,
    usage: { inputAudioBytes: 42 },
    transcript: 'private', rawAudio: Buffer.from('private'), answer: 'private', apiKey: 'private',
  } as never);
  assert.equal(telemetry.latencyMs, 0);
  assert(!('transcript' in telemetry) && !('rawAudio' in telemetry) && !('answer' in telemetry) && !('apiKey' in telemetry));
  const oldRate = { ...realtimePricing.openai };
  Object.assign(realtimePricing.openai, {
    inputTextUsdPerMillion: 1, outputTextUsdPerMillion: 2,
    inputAudioUsdPerMillion: 3, outputAudioUsdPerMillion: 4,
  });
  assert.equal(estimateRealtimeCostUsd('openai', {
    inputTextTokens: 1_000_000, outputTextTokens: 1_000_000,
    inputAudioTokens: 1_000_000, outputAudioTokens: 1_000_000,
  }), 10);
  Object.assign(realtimePricing.openai, oldRate);

  const fakeSpeech: SpeechProvider = {
    id: 'fake',
    async synthesize(request) {
      assert.equal(request.text, 'Fallback text');
      assert.equal(request.userId, 'user-1');
      return { audioUrl: 'https://audio.test/fallback.mp3', providerId: 'fake', model: 'fake-v1' };
    },
  };
  setDefaultSpeechProviderForTests(fakeSpeech);
  assert.deepEqual(await generateConversationSpeech('Fallback text', 'dana', 'en', 'user-1'), {
    transcriptText: 'Fallback text', audioUrl: 'https://audio.test/fallback.mp3',
  });
  setDefaultSpeechProviderForTests(undefined);

  console.log('M4 voice providers: secure bootstrap, substitution, grounded commands, privacy, cost, SpeechProvider passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
