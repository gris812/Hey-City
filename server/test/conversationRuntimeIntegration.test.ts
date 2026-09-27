import assert from 'node:assert/strict';
import type { ConversationIntent, NarrativePlan } from '@heycity/shared';
import type { GenerativeTaskRequest, GenerativeTaskResult } from '../src/ai/generativeProvider';
import type { EvidenceBundle } from '../src/services/evidence';
import { ConversationAnswerGenerator } from '../src/services/conversationAnswerGenerator';
import { ConversationIntentResolver } from '../src/services/conversationIntentResolver';
import {
  ConversationService,
  ConversationTurnSupersededError,
  type ConversationServiceDependencies,
  type ConversationSessionContext,
} from '../src/services/conversationService';
import { ConversationRuntime } from '../src/services/conversationRuntime';
import { createJourneyState, type JourneyState } from '../src/services/journeyContext';
import type { ConversationNearbyProvider, NearbySearchRequest, NearbySearchResult } from '../src/conversation/tools/types';
import { sanitizeConversationTelemetryEvent } from '../src/services/usage';

const coffeeResults: NearbySearchResult[] = [{
  id: 'cafe-1', name: 'Grounded Cafe', category: 'cafe', latitude: 40.707, longitude: -74.011,
  address: '1 Main Street', distanceMeters: 90,
}];

const evidence: EvidenceBundle = {
  subjectId: 'federal-hall', subjectName: 'Federal Hall', category: 'historical_landmark', sourceVersion: 'test',
  items: [
    { id: 'federal-hall-congress', claim: 'Federal Hall hosted the first United States Congress.', sourceType: 'test', confidence: 1 },
    { id: 'not-in-plan', claim: 'This evidence must never enter a conversation answer.', sourceType: 'test', confidence: 1 },
  ],
};

const plan = {
  moment: { relationship: 'new_topic', intent: 'explain', delivery: 'brief_story' },
  narrativeAngle: 'civic history', evidenceRefs: ['federal-hall-congress'],
} as Pick<NarrativePlan, 'moment' | 'narrativeAngle' | 'evidenceRefs'>;

type Resolver = Pick<ConversationIntentResolver, 'resolve'>;
type AnswerGenerator = Pick<ConversationAnswerGenerator, 'generate'>;

function resolved(intent: ConversationIntent, queryCategory?: string): Resolver {
  return { resolve: async () => ({ intent, ...(queryCategory ? { queryCategory } : {}), deterministic: true }) };
}

function buildSession(guideId = 'dana', language = 'en'): ConversationSessionContext {
  const journey = createJourneyState(`conversation-integration-${guideId}`);
  journey.updateMovement({ mode: 'vehicle', latitude: 40.707, longitude: -74.011, observedAt: '2026-09-27T12:00:00.000Z' });
  journey.updateArea({ city: 'New York', neighborhood: 'Financial District', source: 'discovery' });
  return {
    id: `session-${guideId}`, userId: 'conversation-test-user', alreadyListening: true,
    params: { voiceId: guideId, language }, journeyState: journey, conversationRuntime: new ConversationRuntime(journey),
  };
}

function startFederalHall(session: ConversationSessionContext, momentId = 'moment-federal-hall'): string {
  session.journeyState.startStory({ momentId, entityId: evidence.subjectId, entityName: evidence.subjectName,
    category: evidence.category, level: 'auto', guideId: session.params.voiceId });
  session.journeyState.recordNarration({ momentId, evidenceRefs: plan.evidenceRefs, topicKeys: ['civic_history'] });
  session.conversationRuntime.activateStory({
    momentId, subjectId: evidence.subjectId, subjectName: evidence.subjectName, level: 'auto', plan, evidence,
    guideId: session.params.voiceId, language: session.params.language,
  });
  return momentId;
}

function service(overrides: Partial<ConversationServiceDependencies> = {}): ConversationService {
  const dependencies: ConversationServiceDependencies = {
    intentResolver: resolved('general_contextual_question') as ConversationIntentResolver,
    answerGenerator: { generate: async () => 'Grounded response.' } as unknown as ConversationAnswerGenerator,
    nearbyProvider: { searchNearby: async () => [] },
    synthesize: async (text) => ({ transcriptText: text, audioUrl: `audio:${text}` }),
    ...overrides,
  };
  return new ConversationService(dependencies);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

async function run(): Promise<void> {
  // T6 / T15: a current-story question sees only active target + plan-bounded evidence; no search is possible.
  {
    const session = buildSession();
    const momentId = startFederalHall(session);
    assert.equal((await service().interrupt(session, { momentId, listenedSeconds: 8 })).ok, true);
    let nearbyCalls = 0;
    let answerInput: unknown;
    const answer = { generate: async (input: unknown) => { answerInput = input; return 'It matters because it was Congress.'; } } as AnswerGenerator;
    const result = await service({
      intentResolver: resolved('ask_about_current_story') as ConversationIntentResolver,
      answerGenerator: answer as ConversationAnswerGenerator,
      nearbyProvider: { searchNearby: async () => { nearbyCalls++; return coffeeResults; } },
    }).turn(session, { text: 'Why is that important?' });
    assert.equal(result.intent, 'ask_about_current_story');
    assert.equal(nearbyCalls, 0, 'contextual follow-up cannot become a Places/Discovery request');
    assert.deepEqual(result.resume, { action: 'resume_existing', momentId });
    assert.deepEqual(result.toolResults?.map(item => item.tool), ['CurrentTarget', 'StoryEvidence']);
    assert.deepEqual(answerInput, {
      intent: 'ask_about_current_story', guideId: 'dana', language: 'en',
      subject: { id: 'federal-hall', name: 'Federal Hall' }, area: { city: 'New York', neighborhood: 'Financial District' },
      evidence: [{ ref: 'federal-hall-congress', text: 'Federal Hall hosted the first United States Congress.' }],
      nearbyResults: undefined, journeyRecall: undefined, userId: 'conversation-test-user', signal: (answerInput as { signal: AbortSignal }).signal,
    }, 'the generator receives only validated, bounded context');
    assert.equal(session.journeyState.getSnapshot().recent.questions.at(-1)?.subjectId, 'federal-hall');
    assert.equal('text' in (session.journeyState.getSnapshot().recent.questions.at(-1) ?? {}), false, 'raw user text never enters JourneyState');
  }

  // Review regression: a non-fast-path category is classified once, validated, searched and grounded.
  {
    const session = buildSession();
    let classifierCalls = 0, nearbyCalls = 0;
    const resolver = new ConversationIntentResolver({ generate: async () => {
      classifierCalls++;
      return { text: '{"intent":"nearby_search","queryCategory":"pharmacy"}', providerId: 'test', model: 'test' };
    } } as never);
    const pharmacy: NearbySearchResult = {
      id: 'pharmacy-1', name: 'Grounded Pharmacy', category: 'pharmacy', latitude: 40.7075, longitude: -74.011,
    };
    const result = await service({
      intentResolver: resolver,
      answerGenerator: new ConversationAnswerGenerator({ generate: async () => {
        throw new Error('validated nearby response must remain deterministic');
      } } as never),
      nearbyProvider: { searchNearby: async (request: NearbySearchRequest) => {
        nearbyCalls++;
        assert.equal(request.queryCategory, 'pharmacy');
        return [pharmacy];
      } },
    }).turn(session, { text: 'Can you locate somewhere nearby where I could fill a prescription?' });
    assert.equal(classifierCalls, 1);
    assert.equal(nearbyCalls, 1);
    assert.equal(result.intent, 'nearby_search');
    assert.match(result.answerText, /Grounded Pharmacy/);
    assert.deepEqual(result.mapActions?.[0]?.places.map(place => place.id), ['pharmacy-1']);
  }

  // Review regression: bounded JourneyRecall facts reach generation; unvisited entities do not.
  {
    const session = buildSession();
    session.journeyState.startStory({ momentId: 'moment-prior', entityId: 'trinity-church', entityName: 'Trinity Church',
      category: 'church', level: 'short', guideId: 'dana', startedAt: '2026-09-27T11:00:00.000Z' });
    session.journeyState.recordNarration({ momentId: 'moment-prior', evidenceRefs: ['trinity-founded'],
      topicKeys: ['local_history'], at: '2026-09-27T11:00:01.000Z' });
    session.journeyState.finishStory({ momentId: 'moment-prior', reason: 'completed', endedAt: '2026-09-27T11:01:00.000Z' });
    let groundedInput: GenerativeTaskRequest | undefined;
    const answerGenerator = new ConversationAnswerGenerator({ generate: async (request: GenerativeTaskRequest) => {
      groundedInput = request;
      return { text: 'We previously discussed Trinity Church.', providerId: 'test', model: 'test' };
    } } as never);
    const result = await service({
      intentResolver: resolved('general_contextual_question') as ConversationIntentResolver,
      answerGenerator,
    }).turn(session, { text: 'What did we talk about earlier?' });
    assert.match(result.answerText, /Trinity Church/);
    const facts = JSON.parse(groundedInput!.input) as { journeyRecall?: Array<{ entityId: string; name: string }> };
    assert.deepEqual(facts.journeyRecall, [{ entityId: 'trinity-church', name: 'Trinity Church', category: 'church', outcome: 'completed' }]);
    assert.doesNotMatch(groundedInput!.input, /unvisited-place/);
    assert.equal(result.toolResults?.find(tool => tool.tool === 'JourneyRecall')?.success, true);
  }

  // T7: area is sourced from JourneyContext; unknown remains unknown rather than a provider lookup.
  {
    const session = buildSession();
    startFederalHall(session);
    let area: unknown = 'unset';
    const result = await service({
      intentResolver: resolved('ask_about_area') as ConversationIntentResolver,
      answerGenerator: { generate: async (input: { area?: unknown }) => { area = input.area; return 'Area answer.'; } } as unknown as ConversationAnswerGenerator,
    }).turn(session, { text: 'What is this area?' });
    assert.deepEqual(area, { city: 'New York', neighborhood: 'Financial District' });
    assert.deepEqual(result.toolResults?.map(item => item.tool), ['CurrentArea']);
    const unknown = buildSession();
    unknown.journeyState.updateArea({ source: 'unknown' });
    let unknownArea: unknown = 'set';
    await service({ intentResolver: resolved('ask_about_area') as ConversationIntentResolver,
      answerGenerator: { generate: async (input: { area?: unknown }) => { unknownArea = input.area; return 'Unknown area.'; } } as unknown as ConversationAnswerGenerator,
    }).turn(unknown, { text: 'What is this area?' });
    assert.equal(unknownArea, null);
  }

  // T8–T10: coffee is an explicit Conversation NearbySearch; commercial cafe results survive and emit a typed map action.
  {
    const session = buildSession();
    const momentId = startFederalHall(session);
    await service().interrupt(session, { momentId, listenedSeconds: 6 });
    let request: unknown;
    const nearbyProvider: ConversationNearbyProvider = { searchNearby: async (input) => { request = input; return coffeeResults; } };
    const result = await service({
      intentResolver: resolved('nearby_search', 'coffee shop') as ConversationIntentResolver,
      nearbyProvider,
      answerGenerator: { generate: async () => 'Grounded Cafe is nearby.' } as unknown as ConversationAnswerGenerator,
    }).turn(session, { text: 'Where can I get coffee nearby?' });
    assert.deepEqual(request, { queryCategory: 'coffee shop', latitude: 40.707, longitude: -74.011,
      radiusMeters: 1200, limit: 5 });
    assert.deepEqual(result.mapActions, [{ type: 'highlight_places', places: [{ id: 'cafe-1', label: 'Grounded Cafe', latitude: 40.707, longitude: -74.011 }] }]);
    assert.deepEqual(result.toolResults?.map(item => [item.tool, item.success, item.resultCount]), [
      ['NearbySearch', true, 1], ['MapHighlight', true, 1],
    ]);
    assert.match(result.answerText, /Grounded Cafe/);
    assert.deepEqual(result.resume, { action: 'resume_existing', momentId });
    assert.equal(session.journeyState.getSnapshot().recent.outcomes.length, 0, 'coffee never completes the interrupted story');
  }

  // T16: persona changes delivery only; exact validated place selection remains stable.
  {
    const router = { generate: async (_request: GenerativeTaskRequest): Promise<GenerativeTaskResult | null> => {
      throw new Error('nearby deterministic answer must not call the LLM');
    } };
    const generator = new ConversationAnswerGenerator(router as never);
    const dana = await generator.generate({ intent: 'nearby_search', guideId: 'dana', language: 'en', nearbyResults: coffeeResults });
    const arthur = await generator.generate({ intent: 'nearby_search', guideId: 'arthur', language: 'en', nearbyResults: coffeeResults });
    assert.match(dana, /Grounded Cafe/);
    assert.match(arthur, /Grounded Cafe/);
    assert.notEqual(dana, arthur, 'persona changes phrasing without changing validated places');
  }

  // T11: only a validated Conversation NearbySearch result can be a navigation destination.
  {
    const session = buildSession();
    const momentId = startFederalHall(session);
    await service().interrupt(session, { momentId, listenedSeconds: 10 });
    const nearby = service({ intentResolver: resolved('nearby_search', 'coffee shop') as ConversationIntentResolver,
      nearbyProvider: { searchNearby: async () => coffeeResults } });
    const nearbyResult = await nearby.turn(session, { text: 'coffee' });
    assert.deepEqual(nearbyResult.resume, { action: 'resume_existing', momentId });
    assert.equal(session.conversationRuntime.getSnapshot().suspendedStory?.momentId, momentId);
    const navigate = service({ intentResolver: resolved('navigation_request') as ConversationIntentResolver });
    const rejected = await navigate.turn(session, { text: 'Take me there', selectedResultId: 'attacker-place' });
    assert.equal(rejected.navigationAction, undefined);
    assert.deepEqual(rejected.resume, { action: 'resume_existing', momentId });
    const accepted = await navigate.turn(session, { text: 'Take me there', selectedResultId: 'cafe-1' });
    assert.deepEqual(accepted.navigationAction, { type: 'navigation_handoff', destination: {
      id: 'cafe-1', name: 'Grounded Cafe', latitude: 40.707, longitude: -74.011,
    } });
    assert.deepEqual(accepted.resume, { action: 'abandon_previous', momentId });
    assert.equal(session.journeyState.getSnapshot().recent.outcomes.at(-1)?.reason, 'skipped');
  }

  // T12–T14: bounded question memory and offline commands; invalid model output gets no tool authority.
  {
    const session = buildSession();
    startFederalHall(session);
    const resolver = new ConversationIntentResolver({ generate: async () => ({ text: '{"intent":"arbitrary_provider_call"}', providerId: 'test', model: 'test' }) } as never);
    let nearbyCalls = 0;
    const result = await service({ intentResolver: resolver,
      nearbyProvider: { searchNearby: async () => { nearbyCalls++; return coffeeResults; } },
    }).turn(session, { text: 'do something unspecified' });
    assert.equal(result.intent, 'general_contextual_question');
    assert.equal(nearbyCalls, 0, 'unrecognised LLM intent cannot execute an arbitrary tool');
    const question = session.journeyState.getSnapshot().recent.questions.at(-1)!;
    assert.deepEqual(Object.keys(question).sort(), ['at', 'intent', 'subjectId']);

    let classifierCalls = 0;
    const counted = new ConversationIntentResolver({ generate: async () => { classifierCalls++; return null; } } as never);
    for (const [text, intent] of [['Stop the story.', 'stop_story'], ['resume', 'resume_story'], ['repeat', 'repeat'], ['tell me more', 'go_deeper']] as const) {
      assert.equal((await counted.resolve({ text })).intent, intent);
    }
    assert.equal(classifierCalls, 0, 'obvious controls never call a classifier');
  }

  // T17: a late provider result cannot publish map/audio/resume after the next turn wins.
  {
    const session = buildSession();
    const momentId = startFederalHall(session);
    await service().interrupt(session, { momentId, listenedSeconds: 3 });
    const pending = deferred<NearbySearchResult[]>();
    let syntheses = 0;
    let call = 0;
    const race = service({
      intentResolver: { resolve: async () => (++call === 1
        ? { intent: 'nearby_search' as const, queryCategory: 'coffee shop', deterministic: true }
        : { intent: 'resume_story' as const, deterministic: true }) } as ConversationIntentResolver,
      nearbyProvider: { searchNearby: async () => pending.promise },
      synthesize: async (text) => { syntheses++; return { transcriptText: text, audioUrl: 'response-audio' }; },
    });
    const first = race.turn(session, { text: 'coffee' });
    await Promise.resolve();
    const second = await race.turn(session, { text: 'Never mind, continue.' });
    pending.resolve(coffeeResults);
    await assert.rejects(first, ConversationTurnSupersededError);
    assert.equal(second.intent, 'resume_story');
    assert.deepEqual(second.resume, { action: 'resume_existing', momentId });
    assert.equal(syntheses, 1, 'only the winning response may synthesize audio');
    assert.deepEqual(session.conversationRuntime.getValidatedNearbyResults(), [], 'late turn cannot publish stale cafe results');
  }

  // T19/T20: privacy is allow-listed and an idle ConversationRuntime makes no model, Maps, or TTS calls.
  {
    const telemetry = sanitizeConversationTelemetryEvent({
      sessionId: 'session-privacy', intent: 'nearby_search', success: true,
      ...( { text: 'Where is coffee?', answerText: 'secret', latitude: 40.707, longitude: -74.011,
        providerPayload: { places: coffeeResults }, evidence: evidence.items[0].claim } as object ),
    } as never);
    assert.deepEqual(telemetry, { sessionId: 'session-privacy', intent: 'nearby_search', success: true });
    let calls = 0;
    const idle = service({
      intentResolver: { resolve: async () => { calls++; return { intent: 'general_contextual_question', deterministic: false }; } } as ConversationIntentResolver,
      nearbyProvider: { searchNearby: async () => { calls++; return []; } },
      answerGenerator: { generate: async () => { calls++; return ''; } } as unknown as ConversationAnswerGenerator,
      synthesize: async (text) => { calls++; return { transcriptText: text, audioUrl: '' }; },
    });
    void idle;
    assert.equal(calls, 0, 'constructing/owning the runtime adds zero idle M3 provider cost');
  }

  console.log('conversation runtime integration T6–T20 tests passed');
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
