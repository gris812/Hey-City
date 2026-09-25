import type { NarrativeBeatKind, NarrativeLevel } from '@heycity/shared';

/** Mutable spoken-language guardrails, independent of runtime limits and providers. */
export const NARRATIVE_FORBIDDEN_PATTERNS = Object.freeze([
  '^\\s*(?:I will tell you about|Let me tell you about|This historic building|Я расскажу вам|Позвольте рассказать|Это историческое здание)',
  '^\\s*(?:This iconic attraction|Хорошо[,!]?\\s*(?:давайте|я расскажу))|^.{0,100} is a historic landmark located in',
  '^\\s*(?:Did you know|Знаете ли вы)',
  '^\\s*.{1,80} (?:was built in|был[ао]? построен[ао]? в) \\d{4}',
  '(?:Would you like (?:to hear|to know more|me to tell)|Shall I tell|Рассказать (?:вам )?(?:больше|подробнее)|Хотите (?:узнать|услышать) больше)',
]);

const BEAT_OBJECTIVES: Readonly<Record<NarrativeBeatKind, string>> = Object.freeze({
  attention: 'Open with a concrete observation or contrast supported by the evidence; do not invent what is visible.',
  hook: 'Make one evidence-backed detail worth noticing, without a label or promise to narrate.',
  context: 'Give only the context needed to understand the reveal; distinguish place and building when supported.',
  reveal: 'Choose one strong factual reveal. Leave other facts for a later detailed story instead of listing all claims.',
  contrast: 'Connect that detail to another supplied fact; avoid unsupported comparisons.',
  stop: 'End naturally on the meaning of the detail, with no generic CTA.',
  callback: 'Briefly connect to what was already heard without restating its opening or repeating its facts.',
  human: 'Use only a relevant supplied claim.',
  transition: 'Use only a relevant supplied claim.',
});

export const CALLBACK_OR_CONTINUATION_BEATS: readonly NarrativeBeatKind[] = Object.freeze(['callback', 'context', 'reveal', 'stop']);
export const VARIATION_BEATS: readonly NarrativeBeatKind[] = Object.freeze(['context', 'contrast', 'reveal', 'stop']);

export function narrativeBeatObjective(kind: NarrativeBeatKind, level: NarrativeLevel): string {
  if (kind === 'reveal' && level === 'long') return 'Add supported context beyond the already-heard reveal.';
  return BEAT_OBJECTIVES[kind] ?? 'Use only a relevant supplied claim.';
}

export function narrativeBeatKinds(input: { preferredBeats: readonly NarrativeBeatKind[]; hasCallback: boolean; continuation: boolean; repeatSignature: boolean }): NarrativeBeatKind[] {
  if (input.continuation || input.hasCallback) return [...CALLBACK_OR_CONTINUATION_BEATS];
  return input.repeatSignature ? [...VARIATION_BEATS] : [...input.preferredBeats];
}

export function narrativeAngle(input: { continuation: boolean; city: boolean; category: string; guideId: string; themeTags: string[] }): string {
  const angle = input.continuation ? 'New context beyond the already-heard story' : input.city ? 'A grounded sense of this city' : input.category === 'bridge'
    ? input.guideId === 'arthur' ? 'Engineering significance of a supported structural detail' : 'A supported visible feature opens an engineering story'
    : input.guideId === 'arthur' ? 'Historical or architectural meaning of a precise detail' : 'A human-scale reveal connecting past and present';
  return `${angle}; category=${input.category}; theme=${input.themeTags.join(',') || 'mixed'}`;
}
