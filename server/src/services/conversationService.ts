import type {
  ConversationCancelRequest,
  ConversationControlResult,
  ConversationInterruptRequest,
  ConversationInterruptResult,
  ConversationIntent,
  ConversationToolResult,
  ConversationTurnRequest,
  ConversationTurnResult,
  MapAction,
  NavigationAction,
} from '@heycity/shared';
import { createDefaultAITaskRouter } from '../ai/aiTaskRouter';
import {
  currentArea,
  currentTarget,
  journeyRecall,
  mapHighlight,
  navigationHandoff,
  nearbySearch,
  storyEvidence,
} from '../conversation/tools/conversationTools';
import type { ConversationNearbyProvider, NearbySearchResult } from '../conversation/tools/types';
import { encodeGeohash } from './geo';
import { recordJourneyQuestion, type JourneyState } from './journeyContext';
import { ConversationAnswerGenerator } from './conversationAnswerGenerator';
import { ConversationIntentResolver } from './conversationIntentResolver';
import { type ConversationRuntime } from './conversationRuntime';
import { GoogleConversationNearbyProvider } from './googleConversationNearbyProvider';
import { generateConversationSpeech } from './narration';
import { recordConversationEvent } from './usage';

export interface ConversationSessionContext {
  id: string;
  userId: string;
  alreadyListening: boolean;
  params: { voiceId: string; language: string };
  journeyState: JourneyState;
  conversationRuntime: ConversationRuntime;
}

export interface ConversationServiceDependencies {
  intentResolver: ConversationIntentResolver;
  answerGenerator: ConversationAnswerGenerator;
  nearbyProvider: ConversationNearbyProvider;
  synthesize: typeof generateConversationSpeech;
}

export class ConversationTurnSupersededError extends Error {
  readonly status = 409;
  constructor() { super('Conversation turn superseded'); }
}

export class ConversationService {
  constructor(private readonly dependencies: ConversationServiceDependencies = defaultDependencies()) {}

  async interrupt(session: ConversationSessionContext, input: ConversationInterruptRequest): Promise<ConversationInterruptResult> {
    const ok = session.conversationRuntime.interrupt(input);
    if (ok) session.alreadyListening = false;
    await recordConversationEvent('conversation_interrupted', {
      sessionId: session.id,
      success: ok,
    }, session.userId);
    return {
      ok,
      ...(ok ? { momentId: input.momentId } : { stale: true }),
      state: ok ? 'listening' : 'idle',
    };
  }

  async turn(session: ConversationSessionContext, input: ConversationTurnRequest): Promise<ConversationTurnResult> {
    const text = typeof input.text === 'string' ? input.text.trim().slice(0, 1000) : '';
    if (!text) throw new Error('Conversation text is required');
    const startedAt = Date.now();
    const runtime = session.conversationRuntime;
    const turn = runtime.beginTurn();
    const assertCurrent = (): void => {
      if (!runtime.isCurrentTurn(turn.turnId)) throw new ConversationTurnSupersededError();
    };
    const suspended = runtime.getSnapshot().suspendedStory;
    const activeContext = runtime.getActiveStoryContext();
    const journey = session.journeyState.getSnapshot();
    const validatedBefore = runtime.getValidatedNearbyResults() as NearbySearchResult[];

    const resolved = await this.dependencies.intentResolver.resolve({
      text,
      hasSuspendedStory: Boolean(suspended),
      hasValidatedDestination: validatedBefore.length > 0,
      language: session.params.language,
      signal: turn.signal,
    });
    assertCurrent();
    runtime.setTurnState(turn.turnId, 'understanding', { intent: resolved.intent });

    const subjectId = activeContext?.subjectId ?? journey.current.targetId;
    recordJourneyQuestion(session.journeyState, {
      intent: resolved.intent,
      ...(subjectId ? { subjectId } : {}),
      ...(resolved.queryCategory ? { normalizedTopic: resolved.queryCategory } : {}),
    });
    await recordConversationEvent('conversation_turn', {
      sessionId: session.id,
      intent: resolved.intent,
      success: true,
      locationBucket: journey.movement
        ? encodeGeohash(journey.movement.latitude, journey.movement.longitude, 5)
        : undefined,
    }, session.userId);

    const toolResults: ConversationToolResult[] = [];
    let nearbyResults: NearbySearchResult[] | undefined;
    let mapActions: MapAction[] | undefined;
    let navigationAction: NavigationAction | undefined;
    const activeToolContext = activeContext ? {
      subjectId: activeContext.subjectId,
      subjectName: activeContext.subjectName,
      evidence: activeContext.evidence.items.map(item => ({ ref: item.id, text: item.claim })),
    } : undefined;

    if (resolved.intent === 'nearby_search' || resolved.intent === 'recommendation_request') {
      runtime.setTurnState(turn.turnId, 'tool_execution', { intent: resolved.intent, tool: 'NearbySearch' });
      const movement = journey.movement;
      if (movement && resolved.queryCategory) {
        try {
          nearbyResults = await nearbySearch(this.dependencies.nearbyProvider, {
            queryCategory: resolved.queryCategory,
            latitude: movement.latitude,
            longitude: movement.longitude,
          }, session.userId, turn.signal);
          assertCurrent();
          runtime.setValidatedNearbyResults(nearbyResults);
          toolResults.push({ tool: 'NearbySearch', success: true, resultCount: nearbyResults.length });
          const action = mapHighlight(nearbyResults);
          if (action) {
            mapActions = [action];
            toolResults.push({ tool: 'MapHighlight', success: true, resultCount: action.places.length });
          }
        } catch (error) {
          if (turn.signal.aborted || !runtime.isCurrentTurn(turn.turnId)) throw new ConversationTurnSupersededError();
          nearbyResults = [];
          toolResults.push({ tool: 'NearbySearch', success: false, resultCount: 0 });
        }
      } else {
        nearbyResults = [];
        toolResults.push({ tool: 'NearbySearch', success: false, resultCount: 0 });
      }
    } else if (resolved.intent === 'navigation_request') {
      runtime.setTurnState(turn.turnId, 'tool_execution', { intent: resolved.intent, tool: 'NavigationHandoff' });
      const validated = runtime.getValidatedNearbyResults() as NearbySearchResult[];
      const selectedId = input.selectedResultId ?? (validated.length === 1 ? validated[0].id : undefined);
      navigationAction = selectedId ? navigationHandoff(selectedId, validated) ?? undefined : undefined;
      toolResults.push({ tool: 'NavigationHandoff', success: Boolean(navigationAction), resultCount: navigationAction ? 1 : 0 });
    } else if (resolved.intent === 'ask_about_area') {
      toolResults.push({ tool: 'CurrentArea', success: Boolean(currentArea(journey)), resultCount: currentArea(journey) ? 1 : 0 });
    } else if (resolved.intent === 'ask_about_current_story' || resolved.intent === 'ask_about_visible_object' ||
        resolved.intent === 'go_deeper' || resolved.intent === 'repeat' || resolved.intent === 'general_contextual_question') {
      const target = currentTarget(activeToolContext);
      const evidence = storyEvidence(activeToolContext);
      toolResults.push({ tool: 'CurrentTarget', success: Boolean(target), resultCount: target ? 1 : 0 });
      toolResults.push({ tool: 'StoryEvidence', success: evidence.length > 0, resultCount: evidence.length });
      if (resolved.intent === 'general_contextual_question') {
        const recall = journeyRecall(journey);
        toolResults.push({ tool: 'JourneyRecall', success: recall.length > 0, resultCount: recall.length });
      }
    }
    assertCurrent();
    for (const tool of toolResults) {
      await recordConversationEvent('conversation_tool', {
        sessionId: session.id,
        intent: resolved.intent,
        tool: tool.tool,
        success: tool.success,
        resultCountBucket: resultCountBucket(tool.resultCount ?? 0),
      }, session.userId);
    }

    runtime.setTurnState(turn.turnId, 'responding', { intent: resolved.intent });
    const subject = activeContext ? { id: activeContext.subjectId, name: activeContext.subjectName } : undefined;
    let answerText: string;
    if (resolved.intent === 'navigation_request') {
      answerText = navigationAction
        ? localized(session.params.language, `Маршрут к ${navigationAction.destination.name} готов.`, `The route to ${navigationAction.destination.name} is ready.`)
        : localized(session.params.language, 'Сначала выберите одно из найденных мест.', 'Choose one of the validated places first.');
    } else if (resolved.intent === 'change_topic') {
      answerText = localized(session.params.language, 'Хорошо, сменим тему.', 'Okay, we will change the subject.');
    } else {
      answerText = await this.dependencies.answerGenerator.generate({
        intent: resolved.intent,
        guideId: session.params.voiceId,
        language: session.params.language,
        subject,
        area: currentArea(journey),
        evidence: storyEvidence(activeToolContext),
        nearbyResults,
        userId: session.userId,
        signal: turn.signal,
      });
    }
    assertCurrent();

    let audioUrl: string | undefined;
    if (answerText) {
      try {
        const audio = await this.dependencies.synthesize(answerText, session.params.voiceId, session.params.language, session.userId);
        assertCurrent();
        audioUrl = audio.audioUrl || undefined;
      } catch (error) {
        if (turn.signal.aborted || !runtime.isCurrentTurn(turn.turnId)) throw new ConversationTurnSupersededError();
      }
    }

    const resume = runtime.decideResume(resolved.intent, Boolean(navigationAction));
    const latency = Date.now() - startedAt;
    await recordConversationEvent('conversation_response', {
      sessionId: session.id,
      intent: resolved.intent,
      success: true,
      latencyBucket: latencyBucket(latency),
    }, session.userId);
    await recordConversationEvent('conversation_resume_decision', {
      sessionId: session.id,
      intent: resolved.intent,
      success: true,
      resumeAction: resume.action,
    }, session.userId);

    return {
      turnId: turn.turnId,
      intent: resolved.intent,
      answerText,
      ...(audioUrl ? { audioUrl } : {}),
      ...(toolResults.length ? { toolResults } : {}),
      ...(mapActions ? { mapActions } : {}),
      ...(navigationAction ? { navigationAction } : {}),
      resume,
    };
  }

  resume(session: ConversationSessionContext, momentId: string): ConversationControlResult {
    const directive = session.conversationRuntime.confirmResume(momentId);
    const ok = directive.action === 'resume_existing';
    if (ok) session.alreadyListening = true;
    return { ok, ...(!ok ? { stale: true } : {}), resume: directive };
  }

  cancel(session: ConversationSessionContext, input: ConversationCancelRequest): ConversationControlResult {
    const ok = session.conversationRuntime.cancelTurn(input.turnId);
    return { ok, ...(!ok ? { stale: true } : {}) };
  }
}

function defaultDependencies(): ConversationServiceDependencies {
  const router = createDefaultAITaskRouter();
  return {
    intentResolver: new ConversationIntentResolver(router),
    answerGenerator: new ConversationAnswerGenerator(router),
    nearbyProvider: new GoogleConversationNearbyProvider(),
    synthesize: generateConversationSpeech,
  };
}

function localized(language: string, ru: string, en: string): string {
  return language.toLowerCase().startsWith('ru') ? ru : en;
}

function latencyBucket(ms: number): 'under_250ms' | 'under_1s' | 'under_3s' | 'over_3s' {
  return ms < 250 ? 'under_250ms' : ms < 1000 ? 'under_1s' : ms < 3000 ? 'under_3s' : 'over_3s';
}

function resultCountBucket(count: number): 'zero' | 'one' | 'two_to_five' | 'six_plus' {
  return count <= 0 ? 'zero' : count === 1 ? 'one' : count <= 5 ? 'two_to_five' : 'six_plus';
}

export const conversationService = new ConversationService();
