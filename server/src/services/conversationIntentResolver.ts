import type { AITaskRouter } from '../ai/aiTaskRouter';
import type { ConversationIntent as SharedConversationIntent } from '@heycity/shared';

export const CONVERSATION_INTENTS = [
  'ask_about_current_story', 'ask_about_visible_object', 'ask_about_area', 'nearby_search',
  'recommendation_request', 'navigation_request', 'go_deeper', 'repeat', 'stop_story',
  'resume_story', 'change_topic', 'general_contextual_question',
] as const;
export type ConversationIntent = SharedConversationIntent;

export interface ResolvedConversationIntent {
  intent: ConversationIntent;
  queryCategory?: string;
  deterministic: boolean;
}

export interface ConversationIntentResolverInput {
  text: string;
  hasSuspendedStory?: boolean;
  hasValidatedDestination?: boolean;
  language?: string;
  signal?: AbortSignal;
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
const nearbyPatterns: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(coffee|cafe|café|espresso)\b|кофе|кофейн|кафе/i, category: 'coffee shop' },
  { pattern: /\b(restaurant|food|eat|lunch|dinner)\b|ресторан|поесть|еда|обед|ужин/i, category: 'restaurant' },
  { pattern: /\b(parking|park the car)\b|парковк/i, category: 'parking' },
  { pattern: /\b(gas|gas station|fuel)\b|заправк|бензин/i, category: 'gas station' },
];

export function parseConversationIntentOutput(value: unknown): ConversationIntent | null {
  if (typeof value !== 'string') return null;
  const parsed = (() => { try { return JSON.parse(value) as unknown; } catch { return null; } })();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const intent = (parsed as Record<string, unknown>).intent;
  return typeof intent === 'string' && (CONVERSATION_INTENTS as readonly string[]).includes(intent)
    ? intent as ConversationIntent : null;
}

/** Obvious commands stay offline. Ambiguous classification is constrained to a validated enum. */
export class ConversationIntentResolver {
  constructor(private readonly router?: Pick<AITaskRouter, 'generate'>) {}

  async resolve(input: ConversationIntentResolverInput): Promise<ResolvedConversationIntent> {
    const text = normalize(input.text);
    if (!text) return { intent: 'general_contextual_question', deterministic: true };
    if (/^(stop|stop story|enough|cancel|хватит|стоп|останови|прекрати)/.test(text)) return { intent: 'stop_story', deterministic: true };
    if (/^(?:never mind[, ]+)?(?:resume|continue|keep going)|^(?:неважно[, ]+)?(?:продолж|возобнов)/.test(text)) return { intent: 'resume_story', deterministic: true };
    if (/^(repeat|say that again|повтори|еще раз)/.test(text)) return { intent: 'repeat', deterministic: true };
    if (/\b(more|go deeper|tell me more)\b|\b(подробн|глубже|расскажи больше)/.test(text)) return { intent: 'go_deeper', deterministic: true };
    if (/^(change (?:the )?topic|something else|другая тема|смени тему|о другом)/.test(text)) return { intent: 'change_topic', deterministic: true };
    if (input.hasValidatedDestination && (/\b(take me there|navigate|directions|go there)\b|\b(веди туда|построй маршрут|поехали туда|навигац)/.test(text))) {
      return { intent: 'navigation_request', deterministic: true };
    }
    for (const entry of nearbyPatterns) if (entry.pattern.test(text)) return { intent: 'nearby_search', queryCategory: entry.category, deterministic: true };
    if (/\b(why is that important|why important|what is that)\b|\b(почему это важно|чем это важно|что это такое)/.test(text)) return { intent: 'ask_about_current_story', deterministic: true };
    if (/\b(around here|this area|neighborhood)\b|\b(этот район|здесь|в этом месте)/.test(text)) return { intent: 'ask_about_area', deterministic: true };

    if (!this.router) return { intent: 'general_contextual_question', deterministic: true };
    try {
      const response = await this.router.generate({
        task: 'conversation_intent_classification',
        instructions: 'Classify the user turn. Return JSON only: {"intent":"one allowed enum"}. Never add tools, places, facts, or prose.',
        input: JSON.stringify({ text: input.text.slice(0, 400), allowedIntents: CONVERSATION_INTENTS }),
        maxOutputTokens: 40,
        signal: input.signal,
      });
      const intent = response ? parseConversationIntentOutput(response.text) : null;
      return { intent: intent ?? 'general_contextual_question', deterministic: false };
    } catch {
      return { intent: 'general_contextual_question', deterministic: false };
    }
  }
}
