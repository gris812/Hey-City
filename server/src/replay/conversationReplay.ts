import type { ConversationIntent, NarrativePlan } from '@heycity/shared';
import type { EvidenceBundle } from '../services/evidence';
import { ConversationRuntime } from '../services/conversationRuntime';
import { ConversationService, ConversationTurnSupersededError, type ConversationServiceDependencies, type ConversationSessionContext } from '../services/conversationService';
import { createJourneyState } from '../services/journeyContext';
import type { ConversationIntentResolver } from '../services/conversationIntentResolver';
import type { ConversationAnswerGenerator, ConversationAnswerInput } from '../services/conversationAnswerGenerator';
import type { NearbySearchResult } from '../conversation/tools/types';

export type ConversationReplayId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
export interface ConversationReplayResult {
  id: ConversationReplayId;
  passed: boolean;
  assertions: string[];
}

const coffee: NearbySearchResult[] = [{
  id: 'cafe-1', name: 'Grounded Cafe', category: 'cafe', latitude: 40.707, longitude: -74.011, distanceMeters: 90,
}];
const farCoffee: NearbySearchResult = {
  id: 'far-cafe', name: 'Outside Radius Cafe', category: 'cafe', latitude: 40.75, longitude: -74.011,
};
const evidence: EvidenceBundle = {
  subjectId: 'federal-hall', subjectName: 'Federal Hall', category: 'historical_landmark', sourceVersion: 'conversation-replay',
  items: [{ id: 'federal-hall-congress', claim: 'Federal Hall hosted the first United States Congress.', sourceType: 'fixture', confidence: 1 }],
};
const plan = { moment: { relationship: 'new_topic', intent: 'explain', delivery: 'brief_story' }, narrativeAngle: 'civic history', evidenceRefs: ['federal-hall-congress'] } as Pick<NarrativePlan, 'moment' | 'narrativeAngle' | 'evidenceRefs'>;

function fixture(): { session: ConversationSessionContext; momentId: string } {
  const journey = createJourneyState('conversation-replay');
  journey.updateMovement({ mode: 'vehicle', latitude: 40.707, longitude: -74.011, observedAt: '2026-09-27T12:00:00.000Z' });
  const session: ConversationSessionContext = {
    id: 'conversation-replay-session', userId: 'replay-user', alreadyListening: true,
    params: { voiceId: 'dana', language: 'en' }, journeyState: journey, conversationRuntime: new ConversationRuntime(journey),
  };
  const momentId = 'moment-federal-hall';
  journey.startStory({ momentId, entityId: evidence.subjectId, entityName: evidence.subjectName, category: evidence.category, level: 'auto', guideId: 'dana' });
  journey.recordNarration({ momentId, evidenceRefs: plan.evidenceRefs, topicKeys: ['civic_history'] });
  session.conversationRuntime.activateStory({ momentId, subjectId: evidence.subjectId, subjectName: evidence.subjectName, level: 'auto', plan, evidence, guideId: 'dana', language: 'en' });
  return { session, momentId };
}

function service(intent: ConversationIntent, overrides: Partial<ConversationServiceDependencies> = {}): ConversationService {
  return new ConversationService({
    intentResolver: { resolve: async () => ({ intent, ...(intent === 'nearby_search' ? { queryCategory: 'coffee shop' } : {}), deterministic: true }) } as unknown as ConversationIntentResolver,
    answerGenerator: { generate: async () => 'Grounded replay answer.' } as unknown as ConversationAnswerGenerator,
    nearbyProvider: { searchNearby: async () => coffee },
    synthesize: async text => ({ transcriptText: text, audioUrl: 'conversation-answer-audio' }),
    ...overrides,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(ok => { resolve = ok; });
  return { promise, resolve };
}

/** Deterministic M3 acceptance replay: never compares generated prose. */
export async function runConversationReplay(): Promise<ConversationReplayResult[]> {
  const results: ConversationReplayResult[] = [];

  // R1 — coffee interruption preserves the original audio/moment and highlights only tool results.
  {
    const { session, momentId } = fixture();
    await service('nearby_search').interrupt(session, { momentId, listenedSeconds: 11 });
    const result = await service('nearby_search', {
      nearbyProvider: { searchNearby: async () => [farCoffee, ...coffee] },
    }).turn(session, { text: 'Where can I get coffee nearby?' });
    const resume = service('nearby_search').resume(session, momentId);
    const passed = result.intent === 'nearby_search' && result.mapActions?.[0]?.places[0]?.id === 'cafe-1' &&
      result.mapActions[0].places.every(place => place.id !== 'far-cafe') &&
      result.resume.action === 'resume_existing' && resume.resume?.action === 'resume_existing' &&
      resume.resume.momentId === momentId && session.journeyState.getSnapshot().recent.outcomes.length === 0;
    results.push({ id: 'R1', passed, assertions: ['explicit NearbySearch', 'hard radius bound', 'validated map place', 'same original moment', 'no completion'] });
  }

  // R2 — contextual question uses active evidence and cannot invoke a Places query.
  {
    const { session, momentId } = fixture();
    await service('ask_about_current_story').interrupt(session, { momentId });
    let places = 0, generations = 0;
    const result = await service('ask_about_current_story', {
      nearbyProvider: { searchNearby: async () => { places++; return coffee; } },
      answerGenerator: { generate: async (input: ConversationAnswerInput) => { generations++; return input.subject?.name === 'Federal Hall' ? 'Grounded answer.' : ''; } } as unknown as ConversationAnswerGenerator,
    }).turn(session, { text: 'Why is that important?' });
    results.push({ id: 'R2', passed: result.intent === 'ask_about_current_story' && places === 0 && generations === 1 && result.resume.action === 'resume_existing',
      assertions: ['active subject', 'StoryEvidence', 'zero Places calls', 'one response generation'] });
  }

  // R3 — stop is deterministic and finalizes an interrupted moment as skipped, never completed.
  {
    const { session, momentId } = fixture();
    const controls = service('stop_story');
    await controls.interrupt(session, { momentId, listenedSeconds: 12 });
    const result = await controls.turn(session, { text: 'Stop the story.' });
    const outcome = session.journeyState.getSnapshot().recent.outcomes.at(-1);
    results.push({ id: 'R3', passed: result.intent === 'stop_story' && result.resume.action === 'abandon_previous' && outcome?.reason === 'skipped',
      assertions: ['offline control intent', 'abandon', 'no phantom completion'] });
  }

  // R4 — only a chosen validated nearby result produces a navigation handoff and abandons prior story.
  {
    const { session, momentId } = fixture();
    const controls = service('nearby_search');
    await controls.interrupt(session, { momentId });
    await controls.turn(session, { text: 'coffee' });
    const navigation = await service('navigation_request').turn(session, { text: 'Take me there.', selectedResultId: 'cafe-1' });
    results.push({ id: 'R4', passed: navigation.navigationAction?.destination.id === 'cafe-1' && navigation.resume.action === 'abandon_previous' &&
      session.journeyState.getSnapshot().recent.outcomes.at(-1)?.reason === 'skipped',
      assertions: ['validated selected destination', 'structured NavigationHandoff', 'prior story abandoned'] });
  }

  // R5 — late nearby response is superseded; only resume turn is allowed to publish state.
  {
    const { session, momentId } = fixture();
    await service('nearby_search').interrupt(session, { momentId });
    const pending = deferred<NearbySearchResult[]>();
    let sequence = 0;
    const runtime = new ConversationService({
      intentResolver: { resolve: async () => (++sequence === 1 ? { intent: 'nearby_search', queryCategory: 'coffee shop', deterministic: true } : { intent: 'resume_story', deterministic: true }) } as unknown as ConversationIntentResolver,
      answerGenerator: { generate: async () => 'Grounded replay answer.' } as unknown as ConversationAnswerGenerator,
      nearbyProvider: { searchNearby: async () => pending.promise },
      synthesize: async text => ({ transcriptText: text, audioUrl: 'conversation-answer-audio' }),
    });
    const oldTurn = runtime.turn(session, { text: 'coffee' });
    await Promise.resolve();
    const winning = await runtime.turn(session, { text: 'Never mind, continue.' });
    pending.resolve(coffee);
    let superseded = false;
    try { await oldTurn; } catch (error) { superseded = error instanceof ConversationTurnSupersededError; }
    results.push({ id: 'R5', passed: superseded && winning.intent === 'resume_story' && winning.resume.action === 'resume_existing' &&
      session.conversationRuntime.getValidatedNearbyResults().length === 0,
      assertions: ['latest turn wins', 'late provider result ignored', 'same story resumes'] });
  }

  return results;
}
