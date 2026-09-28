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

class FakeTransport implements RealtimeVoiceTransport {
  readonly kind = 'native' as const;
  handler?: (event: RealtimeClientEvent) => void;
  constructor(readonly log: string[]) {}
  failCommands = false;
  configureSession(input: { providerId: string; generation: number }) { this.log.push(`configure:${input.providerId}:${input.generation}`); }
  async createClientOffer() { this.log.push('offer'); return 'client-sdp'; }
  async connect(_connection: RealtimeClientConnection) { this.log.push('connect'); }
  async startCapture() { this.log.push('capture:start'); }
  async stopCapture() { this.log.push('capture:stop'); }
  async interruptOutput() { this.log.push('output:interrupt'); }
  async applyCommands(commands: import('@heycity/shared').RealtimeClientCommand[]) {
    this.log.push(`commands:${commands.length}`);
    if (this.failCommands) throw new Error('provider output failed');
  }
  async close() { this.log.push('transport:close'); }
  onEvent(handler: (event: RealtimeClientEvent) => void) { this.handler = handler; return () => { this.handler = undefined; }; }
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

void run();
