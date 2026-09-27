import type { AITaskRouter } from '../ai/aiTaskRouter';
import { conversation } from '../config';
import { guidePolicy } from './guidePolicy';
import type { ConversationIntent } from './conversationIntentResolver';
import type { NearbySearchResult, BoundedStoryEvidence, JourneyRecallItem } from '../conversation/tools/types';

export interface ConversationAnswerInput {
  intent: ConversationIntent;
  guideId: string;
  language: string;
  subject?: { id: string; name: string };
  area?: Record<string, string> | null;
  evidence?: BoundedStoryEvidence[];
  nearbyResults?: NearbySearchResult[];
  journeyRecall?: JourneyRecallItem[];
  userId?: string;
  signal?: AbortSignal;
}

function deterministicAnswer(input: ConversationAnswerInput): string | null {
  const ru = input.language.toLowerCase().startsWith('ru');
  if (input.intent === 'stop_story') return ru ? 'Останавливаю рассказ.' : 'I’ll stop the story.';
  if (input.intent === 'resume_story') return ru ? 'Продолжаем с того же места.' : 'Let’s continue from the same moment.';
  if (input.intent === 'repeat') return ru ? 'Повторю текущий фрагмент.' : 'I’ll repeat the current part.';
  if (input.intent === 'nearby_search' && input.nearbyResults) {
    if (!input.nearbyResults.length) return ru ? 'Рядом подходящих мест пока не нашла.' : 'I could not find a suitable nearby place.';
    const names = input.nearbyResults.slice(0, 3).map(place => place.name).join(', ');
    const arthur = input.guideId === 'arthur' || input.guideId === 'artur';
    if (ru) return arthur
      ? `Ближайшие варианты: ${names}. Я отметил их на карте.`
      : `Нашла рядом: ${names}. Отмечаю их на карте.`;
    return arthur
      ? `The nearest options are ${names}. I have marked them on the map.`
      : `I found these nearby: ${names}. I’ve highlighted them on the map.`;
  }
  return null;
}

/** A single grounded generation call at most. Deterministic controls and nearby listing avoid the model entirely. */
export class ConversationAnswerGenerator {
  constructor(private readonly router: Pick<AITaskRouter, 'generate'>) {}

  async generate(input: ConversationAnswerInput): Promise<string> {
    const direct = deterministicAnswer(input);
    if (direct) return direct;
    const policy = guidePolicy(input.guideId);
    const facts = {
      intent: input.intent,
      subject: input.subject,
      area: input.area ?? undefined,
      evidence: (input.evidence ?? []).slice(0, conversation.maxEvidenceItems),
      nearbyResults: (input.nearbyResults ?? []).slice(0, conversation.nearbySearchLimit).map(({ id, name, category, distanceMeters, address }) => ({ id, name, category, distanceMeters, address })),
      journeyRecall: (input.journeyRecall ?? []).slice(0, conversation.maxRecallItems).map(({ entityId, name, category, outcome }) => ({
        entityId, name, category, outcome,
      })),
    };
    const response = await this.router.generate({
      task: 'complex_follow_up',
      instructions: [
        'Write one concise spoken guide answer using only FACTS JSON.',
        'Do not invent facts, places, ratings, URLs, or source claims. Do not give navigation instructions.',
        `Persona: ${policy.behavior.join(' ')}`,
      ].join(' '),
      input: JSON.stringify(facts), maxOutputTokens: 180, userId: input.userId, signal: input.signal,
    });
    if (response?.text?.trim()) return response.text.trim().slice(0, conversation.maxAnswerCharacters);
    const ru = input.language.toLowerCase().startsWith('ru');
    return input.subject ? (ru ? `Сейчас речь о ${input.subject.name}.` : `We are currently talking about ${input.subject.name}.`) :
      (ru ? 'Уточните, пожалуйста, что именно вас интересует.' : 'Please tell me what you would like to know.');
  }
}
