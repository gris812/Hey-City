import assert from 'node:assert/strict';
import type { ConversationIntent, NarrativePlan } from '@heycity/shared';
import type { EvidenceBundle } from '../src/services/evidence';
import { createSession, stopSession, type DriveSession } from '../src/services/driveSession';
import { ConversationService, type ConversationServiceDependencies } from '../src/services/conversationService';
import type { ConversationIntentResolver } from '../src/services/conversationIntentResolver';
import type { ConversationAnswerGenerator } from '../src/services/conversationAnswerGenerator';
import type { NearbySearchResult } from '../src/conversation/tools/types';
import { RealtimeConversationBridge } from '../src/services/realtimeConversationBridge';
import { RealtimeVoiceSession } from '../src/services/realtimeVoiceSession';
import { DeterministicRealtimeConversationProvider } from '../src/voice/deterministicRealtimeProvider';
import { RealtimeProviderRouter } from '../src/voice/realtimeProviderRouter';
import type { RealtimeConversationProvider, SpeechProvider } from '../src/voice/contracts';

const evidence: EvidenceBundle = {
  subjectId: 'federal-hall', subjectName: 'Federal Hall', category: 'historical_landmark', sourceVersion: 'm4-test',
  items: [{ id: 'federal-hall-congress', claim: 'Federal Hall hosted the first United States Congress.', sourceType: 'fixture', confidence: 1 }],
};
const plan = {
  moment: { relationship: 'new_topic', intent: 'explain', delivery: 'brief_story' },
  narrativeAngle: 'civic history', evidenceRefs: ['federal-hall-congress'],
} as Pick<NarrativePlan, 'moment' | 'narrativeAngle' | 'evidenceRefs'>;
const coffee: NearbySearchResult[] = [{
  id: 'cafe-1', name: 'Grounded Cafe', category: 'cafe', latitude: 40.707, longitude: -74.011, distanceMeters: 90,
}];

function fixture(): { session: DriveSession; momentId: string } {
  const session = createSession(`m4-user-${Date.now()}-${Math.random()}`, {
    mode: 'vehicle', autoMode: false, themeTags: ['mixed'], narrationStyle: 'documentary', lengthSec: 90,
    leadTimeMin: 2, voiceId: 'dana', language: 'en', autoplay: true,
  });
  session.journeyState.updateMovement({ mode: 'vehicle', latitude: 40.707, longitude: -74.011, observedAt: '2026-09-27T12:00:00.000Z' });
  const momentId = `moment-${session.id}`;
  session.journeyState.startStory({ momentId, entityId: evidence.subjectId, entityName: evidence.subjectName, category: evidence.category, level: 'auto', guideId: 'dana' });
  session.journeyState.recordNarration({ momentId, evidenceRefs: plan.evidenceRefs, topicKeys: ['civic_history'] });
  session.conversationRuntime.activateStory({ momentId, subjectId: evidence.subjectId, subjectName: evidence.subjectName, level: 'auto', plan, evidence, guideId: 'dana', language: 'en' });
  return { session, momentId };
}

function service(resolve: (text: string) => ConversationIntent, overrides: Partial<ConversationServiceDependencies> = {}) {
  let synthesizeCalls = 0;
  const instance = new ConversationService({
    intentResolver: { resolve: async ({ text }: { text: string }) => {
      const intent = resolve(text);
      return { intent, ...(intent === 'nearby_search' ? { queryCategory: /parking/i.test(text) ? 'parking' : 'coffee shop' } : {}), deterministic: true };
    } } as unknown as ConversationIntentResolver,
    answerGenerator: { generate: async () => 'Grounded approved answer.' } as unknown as ConversationAnswerGenerator,
    nearbyProvider: { searchNearby: async () => coffee },
    synthesize: async text => { synthesizeCalls += 1; return { transcriptText: text, audioUrl: 'legacy-tts' }; },
    ...overrides,
  });
  return { instance, synthesizeCalls: () => synthesizeCalls };
}

const fallbackSpeech: SpeechProvider = {
  id: 'fallback',
  synthesize: async () => ({ audioUrl: 'fallback-audio', providerId: 'fallback', model: 'fixture' }),
};

function runtime(session: DriveSession, conversation: ConversationService, provider: RealtimeConversationProvider = new DeterministicRealtimeConversationProvider(), timers?: {
  setTimer: typeof setTimeout;
  clearTimer: typeof clearTimeout;
}) {
  const voice = new RealtimeVoiceSession(session, {
    providerRouter: new RealtimeProviderRouter([provider], provider.id),
    bridge: new RealtimeConversationBridge(conversation, fallbackSpeech),
    ...timers,
  });
  session.realtimeVoiceSession = voice;
  return { voice, provider };
}

async function interrupt(session: DriveSession, momentId: string, conversation: ConversationService) {
  const result = await conversation.interrupt(session, { momentId, listenedSeconds: 11 });
  assert.equal(result.ok, true);
}

function turn(text: string, id: string, providerId = 'deterministic') {
  return { voiceTurnId: id, text, isFinal: true, startedAt: '2026-09-27T12:00:00.000Z', providerId };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(ok => { resolve = ok; });
  return { promise, resolve };
}

async function run(): Promise<void> {
  // T1/T2: DriveSession creation is free; concurrent activation owns one provider session.
  {
    const { session } = fixture();
    const deterministic = new DeterministicRealtimeConversationProvider();
    const { instance } = service(() => 'ask_about_current_story');
    const { voice } = runtime(session, instance, deterministic);
    assert.equal(deterministic.sessions.length, 0);
    const [a, b] = await Promise.all([
      voice.connect({ transport: 'native' }),
      voice.connect({ transport: 'native' }),
    ]);
    assert.equal(a.connection.providerSessionId, b.connection.providerSessionId);
    assert.equal(deterministic.sessions.length, 1);
    await voice.close('client_closed');
    stopSession(session.id);
  }

  // T3/T5: failed secure bootstrap never exposes a key and leaves the M3 story resumable.
  {
    const { session, momentId } = fixture();
    const { instance } = service(() => 'ask_about_current_story');
    await interrupt(session, momentId, instance);
    const failing: RealtimeConversationProvider = { id: 'failed', createSession: async () => { throw new Error('provider down'); } };
    const { voice } = runtime(session, instance, failing);
    await assert.rejects(() => voice.connect({ transport: 'native' }), /provider down/);
    assert.equal(session.conversationRuntime.getSnapshot().suspendedStory?.momentId, momentId);
    assert.equal(voice.snapshot().state, 'closed');
    stopSession(session.id);
  }

  // T6-T12: only final turns enter canonical M3; grounded text is the only provider command.
  {
    const { session, momentId } = fixture();
    const canonical = service(text => /^stop/i.test(text) ? 'stop_story' : 'nearby_search');
    await interrupt(session, momentId, canonical.instance);
    const { voice } = runtime(session, canonical.instance);
    const connection = await voice.connect({ transport: 'native' });
    assert(!JSON.stringify(connection).toLowerCase().includes('api-key'));
    const partial = await voice.submitUserTurn({ ...turn('coffee', 'partial'), isFinal: false });
    assert.equal(partial.accepted, false);
    const result = await voice.submitUserTurn(turn('Where can I get coffee nearby?', 'coffee-1'));
    assert.equal(result.accepted, true);
    if (!result.accepted) throw new Error('expected accepted turn');
    assert.equal(result.result.intent, 'nearby_search');
    assert.equal(result.result.mapActions?.[0]?.places[0]?.id, 'cafe-1');
    assert.deepEqual(result.result.resume, { action: 'resume_existing', momentId });
    assert.equal(canonical.synthesizeCalls(), 0, 'realtime M3 path must not invoke legacy TTS');
    const speak = result.commands.find(command => command.type === 'speak_grounded_answer');
    assert.equal(speak?.type === 'speak_grounded_answer' ? speak.text : undefined, result.result.answerText);
    const fallback = await voice.renderFallback({ generation: result.generation, voiceTurnId: 'coffee-1' });
    assert.equal(fallback.audioUrl, 'fallback-audio', 'output failure renders the existing grounded answer without rerunning M3');
    assert.equal(canonical.synthesizeCalls(), 0, 'fallback uses SpeechProvider, not the normal M3 synthesis dependency');
    assert.equal(session.journeyState.getSnapshot().recent.outcomes.length, 0, 'interruption is not completion');
    const stopped = await voice.submitUserTurn(turn('Stop the story.', 'stop-1'));
    assert.equal(stopped.accepted && stopped.result.resume.action, 'abandon_previous');
    assert.equal(session.journeyState.getSnapshot().recent.outcomes.at(-1)?.reason, 'skipped');
    await voice.close('client_closed');
    stopSession(session.id);
  }

  // T13/T14: barge-in and a newer final turn invalidate stale provider/M3 output.
  {
    const { session, momentId } = fixture();
    const pending = deferred<NearbySearchResult[]>();
    const canonical = service(text => /parking/i.test(text) ? 'nearby_search' : 'nearby_search', {
      nearbyProvider: { searchNearby: async query => query.queryCategory === 'parking' ? [{ ...coffee[0], id: 'parking-1', name: 'Parking' }] : pending.promise },
    });
    await interrupt(session, momentId, canonical.instance);
    const { voice } = runtime(session, canonical.instance);
    await voice.connect({ transport: 'native' });
    const oldTurn = voice.submitUserTurn(turn('coffee', 'old'));
    await Promise.resolve();
    const barge = await voice.bargeIn();
    assert.equal(barge.ok, true);
    assert(barge.commands?.some(command => command.type === 'cancel_response'));
    const winner = await voice.submitUserTurn(turn('parking', 'new'));
    pending.resolve(coffee);
    await assert.rejects(oldTurn, /superseded/i);
    assert.equal(winner.accepted && winner.result.mapActions?.[0]?.places[0]?.id, 'parking-1');
    const staleUsage = await voice.reportUsage({ providerId: 'deterministic', generation: barge.generation, voiceTurnId: 'old', usage: { inputAudioBytes: 5 } });
    assert.equal(staleUsage, false);
    await voice.close('client_closed');
    stopSession(session.id);
  }

  // T15/T16/T18/T20: inactivity closes resources, reopen is clean, stop invalidates synchronously, idle cost is zero.
  {
    const { session } = fixture();
    const callbacks: Array<() => void> = [];
    const timers = {
      setTimer: ((callback: () => void) => { callbacks.push(callback); return { unref() {} } as unknown as ReturnType<typeof setTimeout>; }) as typeof setTimeout,
      clearTimer: (() => {}) as typeof clearTimeout,
    };
    const deterministic = new DeterministicRealtimeConversationProvider();
    const { instance } = service(() => 'ask_about_current_story');
    const { voice } = runtime(session, instance, deterministic, timers);
    assert.equal(deterministic.sessions.length, 0);
    await voice.connect({ transport: 'native' });
    callbacks[0]();
    await Promise.resolve();
    assert.equal(voice.snapshot().state, 'closed');
    await voice.connect({ transport: 'native' });
    assert.equal(deterministic.sessions.length, 2);
    assert.equal(stopSession(session.id), true);
    assert.equal(voice.snapshot().state, 'closed');
  }

  assert.equal(RealtimeVoiceSession.activeSessionCountForTests(), 0);
  console.log('M4 realtime session T1-T20 lifecycle/bridge regression passed');
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
