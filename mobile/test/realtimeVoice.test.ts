import assert from 'node:assert/strict';
import type {
  ConversationTurnResult,
  RealtimeClientConnection,
  RealtimeUserTurn,
} from '@heycity/shared';
import {
  RealtimeVoiceClientSession,
  type RealtimeClientEvent,
  type RealtimeVoiceTransport,
} from '../src/features/live/realtimeVoice';
import { OpenAIRealtimeCodec } from '../src/features/live/openAIRealtimeCodec';

class FakeTransport implements RealtimeVoiceTransport {
  readonly kind = 'native' as const;
  handler?: (event: RealtimeClientEvent) => void;
  lastHandler?: (event: RealtimeClientEvent) => void;
  constructor(readonly log: string[]) {}
  failCommands = false;
  failConnect = false;
  permissionFailure = false;
  configureSession(input: { providerId: string; generation: number }) { this.log.push(`configure:${input.providerId}:${input.generation}`); }
  async createClientOffer() { this.log.push('offer'); return 'client-sdp'; }
  async connect(_connection: RealtimeClientConnection) {
    this.log.push('connect');
    if (this.failConnect) throw new Error('provider connect failed');
  }
  async startCapture() {
    this.log.push('capture:start');
    if (this.permissionFailure) throw new Error('microphone permission not allowed');
  }
  async stopCapture() { this.log.push('capture:stop'); }
  async interruptOutput() { this.log.push('output:interrupt'); }
  async applyCommands(commands: import('@heycity/shared').RealtimeClientCommand[]) {
    this.log.push(`commands:${commands.length}`);
    if (this.failCommands) throw new Error('provider output failed');
  }
  async close() { this.log.push('transport:close'); }
  onEvent(handler: (event: RealtimeClientEvent) => void) {
    this.handler = handler;
    this.lastHandler = handler;
    return () => { this.handler = undefined; };
  }
  emit(event: RealtimeClientEvent) { this.handler?.(event); }
}

const connection: RealtimeClientConnection = {
  providerId: 'deterministic',
  providerSessionId: 'provider-1',
  model: 'deterministic-v1',
  transport: 'native',
  expiresAt: '2099-01-01T00:00:00.000Z',
  connection: { kind: 'deterministic' },
};

const answer: ConversationTurnResult = {
  turnId: 'm3-1',
  intent: 'nearby_search',
  answerText: 'Grounded coffee answer.',
  resume: { action: 'resume_existing', momentId: 'moment-1' },
};

const finalTurn: RealtimeUserTurn = {
  voiceTurnId: 'voice-1',
  text: 'coffee',
  isFinal: true,
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T00:00:01.000Z',
  providerId: 'deterministic',
};

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

async function run() {
  let now = 1_000;
  const codec = new OpenAIRealtimeCodec(() => now);
  codec.configure({ providerId: 'openai_realtime', generation: 4 });
  codec.decode(JSON.stringify({ type: 'input_audio_buffer.speech_started' }));
  codec.decode(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'voice-latency', transcript: 'coffee' }));
  now = 1_275;
  codec.decode(JSON.stringify({ type: 'response.audio.delta', delta: 'audio' }));
  now = 1_500;
  codec.decode(JSON.stringify({ type: 'response.output_audio.delta', delta: 'later-audio' }));
  const completedEvent = codec.decode(JSON.stringify({
    type: 'response.done',
    response: { usage: { input_token_details: { audio_tokens: 12 }, output_token_details: { audio_tokens: 8 } } },
  }));
  assert.equal(completedEvent?.type, 'response_completed');
  if (completedEvent?.type === 'response_completed') {
    assert.equal(completedEvent.usage?.firstAudioLatencyMs, 275, 'first audio latency uses the first provider audio delta');
  }

  await testFailClosedActivationRecovery();
  await testBootstrapFailureRecovery();
  await testPermissionFailureRecovery();

  const log: string[] = [];
  const transport = new FakeTransport(log);
  let interruptCount = 0;
  let connectCount = 0;
  let submitted = 0;
  let completed = 0;
  let closed = 0;
  let timerCallback: (() => void) | undefined;
  const session = new RealtimeVoiceClientSession({
    sessionId: 'drive-1',
    transport,
    interruptInitialStory: async () => { interruptCount += 1; log.push('story:pause+interrupt'); return true; },
    connect: async ({ transport: kind, clientSdp }) => {
      connectCount += 1;
      assert.equal(kind, 'native');
      assert.equal(clientSdp, 'client-sdp');
      log.push('bootstrap');
      return { sessionId: 'drive-1', providerId: 'deterministic', generation: 1, state: 'ready', connection };
    },
    submitTurn: async (turn) => {
      submitted += 1;
      assert.equal(turn.text, 'coffee');
      return { accepted: true, generation: 2, state: 'speaking', result: answer, commands: [{ type: 'speak_grounded_answer', voiceTurnId: turn.voiceTurnId, text: answer.answerText, renderingInstructions: 'exact' }] };
    },
    bargeIn: async () => { log.push('server:barge'); return { generation: 3, state: 'listening' }; },
    closeRemote: async () => { closed += 1; log.push('server:close'); },
    onGroundedResult: (result) => { assert.equal(result.answerText, answer.answerText); log.push('grounded'); },
    onAnswerComplete: async (result) => { completed += 1; assert.equal(result.resume.action, 'resume_existing'); log.push('resume'); },
    inactivityTimeoutMs: 10,
    setTimer: ((callback: () => void) => { timerCallback = callback; return 1 as unknown as ReturnType<typeof setTimeout>; }) as typeof setTimeout,
    clearTimer: (() => { timerCallback = undefined; }) as typeof clearTimeout,
  });

  assert.equal(log.length, 0, 'constructing a DriveSession voice client opens no provider connection');
  assert.equal(await session.activate(), true);
  assert.deepEqual(log.slice(0, 6), ['story:pause+interrupt', 'offer', 'bootstrap', 'configure:deterministic:1', 'connect', 'capture:start'], 'local M3 interruption precedes all realtime network/transport work');
  assert.equal(interruptCount, 1);
  assert.equal(connectCount, 1);

  transport.emit({ type: 'user_turn', turn: { ...finalTurn, isFinal: false } });
  await settle();
  assert.equal(submitted, 0, 'partial transcripts remain transport-local');
  transport.emit({ type: 'user_turn', turn: finalTurn });
  await settle();
  assert.equal(submitted, 1, 'one final normalized turn reaches the M3 bridge');
  assert.ok(log.includes('grounded'));
  assert.ok(log.includes('configure:deterministic:2'));
  transport.emit({ type: 'response_started', generation: 2, voiceTurnId: 'voice-1' });
  transport.emit({ type: 'response_completed', generation: 2, voiceTurnId: 'voice-1' });
  await settle();
  assert.equal(completed, 1, 'resume is applied only after the current spoken answer completes');

  // A new speech start while output is active stops output locally before server cancellation.
  transport.emit({ type: 'user_turn', turn: { ...finalTurn, voiceTurnId: 'voice-2' } });
  await settle();
  transport.emit({ type: 'response_started', generation: 2, voiceTurnId: 'voice-2' });
  transport.emit({ type: 'speech_started' });
  await settle();
  assert.ok(log.indexOf('output:interrupt') < log.indexOf('server:barge'));
  transport.emit({ type: 'response_completed', generation: 2, voiceTurnId: 'voice-2' });
  await settle();
  assert.equal(completed, 1, 'stale completion after barge-in cannot resume story audio');

  assert.ok(timerCallback, 'activity arms bounded inactivity cleanup');
  timerCallback?.();
  await settle();
  assert.equal(session.getState(), 'closed');
  assert.equal(closed, 1);

  // The prior answer resumed the story, so a fresh activation interrupts that
  // now-playing original moment exactly once again.
  assert.equal(await session.activate(), true);
  assert.equal(interruptCount, 2);
  await session.close();

  // Provider output failure asks the server to synthesize the already-grounded answer;
  // it does not submit a second M3 turn or repeat tools.
  const fallbackLog: string[] = [];
  const fallbackTransport = new FakeTransport(fallbackLog);
  fallbackTransport.failCommands = true;
  let fallbackRequests = 0;
  let fallbackCompletions = 0;
  const fallbackSession = new RealtimeVoiceClientSession({
    sessionId: 'drive-fallback', transport: fallbackTransport,
    interruptInitialStory: async () => true,
    connect: async () => ({ sessionId: 'drive-fallback', providerId: 'deterministic', generation: 1, state: 'ready', connection }),
    submitTurn: async (voiceTurn) => ({ accepted: true, generation: 2, state: 'speaking', result: answer,
      commands: [{ type: 'speak_grounded_answer', voiceTurnId: voiceTurn.voiceTurnId, text: answer.answerText, renderingInstructions: 'exact' }] }),
    bargeIn: async () => ({ generation: 3, state: 'listening' }),
    closeRemote: async () => {},
    requestFallback: async ({ generation, voiceTurnId }) => {
      fallbackRequests += 1;
      assert.equal(generation, 2); assert.equal(voiceTurnId, 'voice-1');
      return { audioUrl: 'fallback-audio' };
    },
    playFallbackAudio: async audioUrl => { assert.equal(audioUrl, 'fallback-audio'); fallbackLog.push('fallback:play'); },
    onGroundedResult: () => {},
    onAnswerComplete: async () => { fallbackCompletions += 1; },
  });
  assert.equal(await fallbackSession.activate(), true);
  fallbackTransport.emit({ type: 'user_turn', turn: finalTurn });
  await settle();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fallbackRequests, 1);
  assert.equal(fallbackCompletions, 1);
  assert.equal(fallbackLog.filter(item => item === 'commands:1').length, 1, 'M3 turn is not repeated');
  await fallbackSession.close();
}

async function testFailClosedActivationRecovery() {
  const log: string[] = [];
  const states: string[] = [];
  const transport = new FakeTransport(log);
  transport.failConnect = true;
  let interrupts = 0;
  let bootstraps = 0;
  let completions = 0;
  let resumes = 0;
  let suspendedMoment: string | undefined = 'moment-1';
  const session = new RealtimeVoiceClientSession({
    sessionId: 'drive-fail-closed', transport,
    interruptInitialStory: async () => {
      interrupts += 1;
      assert.equal(suspendedMoment, 'moment-1', 'retry interrupts the same original moment after recovery');
      return true;
    },
    connect: async () => {
      bootstraps += 1;
      return { sessionId: 'drive-fail-closed', providerId: 'deterministic', generation: bootstraps, state: 'ready', connection };
    },
    submitTurn: async () => ({ accepted: false, generation: 0, state: 'closed' }),
    bargeIn: async () => ({ generation: 0, state: 'closed' }),
    closeRemote: async () => { log.push('server:close'); },
    onGroundedResult: () => {},
    onAnswerComplete: () => { completions += 1; },
    onStateChange: state => { states.push(state); },
    onClosed: async () => {
      resumes += 1;
      assert.equal(suspendedMoment, 'moment-1', 'failure recovery resumes the original moment');
    },
  });

  assert.equal(await session.activate(), false);
  const staleHandler = transport.lastHandler;
  assert.deepEqual(states.slice(-2), ['error', 'closed'], 'diagnostic error is transient and fail-closed wins');
  assert.equal(session.getState(), 'closed');
  assert.equal(resumes, 1);
  assert.equal(interrupts, 1);
  assert.equal(bootstraps, 1);
  assert.equal(completions, 0);
  assert.ok(log.includes('capture:stop'));
  assert.ok(log.includes('transport:close'));
  assert.ok(log.includes('server:close'));

  staleHandler?.({ type: 'response_completed', generation: 1, voiceTurnId: 'stale' });
  staleHandler?.({ type: 'state', state: 'speaking' });
  await settle();
  assert.equal(session.getState(), 'closed', 'late callbacks from the failed generation stay invalidated');
  assert.equal(resumes, 1, 'late callbacks cannot resume the story twice');
  assert.equal(completions, 0, 'failed activation cannot create a phantom completion');

  transport.failConnect = false;
  assert.equal(await session.activate(), true, 'next Talk performs a clean activation');
  assert.equal(bootstraps, 2, 'retry invokes a new provider bootstrap');
  assert.equal(interrupts, 2, 'each attempt registers exactly one interruption, after prior resume');
  await session.close();
  assert.equal(resumes, 2, 'closing the successful retry resumes the same suspended moment once');
}

async function testPermissionFailureRecovery() {
  const log: string[] = [];
  const states: string[] = [];
  const transport = new FakeTransport(log);
  transport.permissionFailure = true;
  let interrupts = 0;
  let resumes = 0;
  const session = new RealtimeVoiceClientSession({
    sessionId: 'drive-permission-failure', transport,
    interruptInitialStory: async () => { interrupts += 1; return true; },
    connect: async () => ({ sessionId: 'drive-permission-failure', providerId: 'deterministic', generation: 1, state: 'ready', connection }),
    submitTurn: async () => ({ accepted: false, generation: 0, state: 'closed' }),
    bargeIn: async () => ({ generation: 0, state: 'closed' }),
    closeRemote: async () => {},
    onGroundedResult: () => {},
    onAnswerComplete: () => {},
    onClosed: async () => { resumes += 1; },
    onStateChange: state => { states.push(state); },
  });

  assert.equal(await session.activate(), false);
  assert.deepEqual(states.slice(-2), ['permission_error', 'closed']);
  assert.equal(session.getState(), 'closed');
  assert.equal(interrupts, 1);
  assert.equal(resumes, 1);
  assert.ok(log.includes('capture:stop'));
  assert.ok(log.includes('transport:close'));
}

async function testBootstrapFailureRecovery() {
  const log: string[] = [];
  const transport = new FakeTransport(log);
  let bootstraps = 0;
  let interrupts = 0;
  let resumes = 0;
  const session = new RealtimeVoiceClientSession({
    sessionId: 'drive-bootstrap-failure', transport,
    interruptInitialStory: async () => { interrupts += 1; return true; },
    connect: async () => {
      bootstraps += 1;
      if (bootstraps === 1) throw new Error('provider bootstrap failed');
      return { sessionId: 'drive-bootstrap-failure', providerId: 'deterministic', generation: 2, state: 'ready', connection };
    },
    submitTurn: async () => ({ accepted: false, generation: 0, state: 'closed' }),
    bargeIn: async () => ({ generation: 0, state: 'closed' }),
    closeRemote: async () => {},
    onGroundedResult: () => {},
    onAnswerComplete: () => {},
    onClosed: async () => { resumes += 1; },
  });

  assert.equal(await session.activate(), false);
  assert.equal(session.getState(), 'closed');
  assert.equal(resumes, 1);
  assert.equal(await session.activate(), true);
  assert.equal(bootstraps, 2, 'a bootstrap failure cannot turn error into a pseudo-active session');
  assert.equal(interrupts, 2, 'the resumed story is interrupted once for the clean retry');
  await session.close();
}

void run();
