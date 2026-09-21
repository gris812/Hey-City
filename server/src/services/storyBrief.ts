import type { MomentPlan, NarrativeBeat, NarrativeLevel, NarrativePlanInput } from '@heycity/shared';
import { narrativeV2 } from '../config';
import { EvidenceBundle, InsufficientEvidenceError, storyAvailability, verifiedItems } from './evidence';
import { GuidePolicy } from './guidePolicy';

export interface StoryContinuationState {
  poiId: string; guideId: string; language: string; previousLevel: 'short'; previousTranscript: string;
}
export interface StoryBrief {
  subject: { id: string; name: string; category: string };
  moment: MomentPlan; level: NarrativeLevel; narrativeAngle: string; beats: NarrativeBeat[];
  evidence: EvidenceBundle;
  /** Deterministically selected claims available to this segment; the full bundle stays server-only. */
  selectedEvidenceRefs: string[];
  continuation?: { previousLevel: 'short'; previousTranscript: string };
  constraints: { targetDurationSec: number; language: string; forbiddenPatterns: string[] };
}
/** Pure planning: no discovery, provider calls, extra facts or raw-source parsing. */
export function buildStoryBrief(input: NarrativePlanInput, evidence: EvidenceBundle, policy: GuidePolicy,
  options: { level: NarrativeLevel; language: string; continuation?: StoryContinuationState }): StoryBrief {
  if (input.poiId !== evidence.subjectId || input.placeName !== evidence.subjectName) throw new Error('Evidence target mismatch');
  const available = storyAvailability(evidence);
  if (!(options.level === 'long' ? available.long : available.short)) throw new InsufficientEvidenceError();
  const prior = options.continuation;
  const continuation = options.level === 'long' && prior?.poiId === input.poiId && prior.guideId === policy.id && prior.language === options.language
    ? { previousLevel: 'short' as const, previousTranscript: prior.previousTranscript } : undefined;
  const city = evidence.category === 'city' || evidence.category === 'region';
  const moment: MomentPlan = {
    relationship: continuation ? 'continuation' : city ? 'orientation' : 'new_topic',
    intent: continuation ? 'connect' : city ? 'orient' : policy.id === 'arthur' ? 'explain' : 'surprise',
    delivery: options.level === 'long' && input.mode !== 'vehicle' ? 'deep_story' : 'brief_story',
  };
  const objectives: Record<string, string> = {
    attention: 'Open with a concrete observation or contrast supported by the evidence; do not invent what is visible.',
    hook: 'Make one evidence-backed detail worth noticing, without a label or promise to narrate.',
    context: 'Give only the context needed to understand the reveal; distinguish place and building when supported.',
    reveal: options.level === 'long' ? 'Add supported context beyond the already-heard reveal.' : 'Choose one strong factual reveal. Leave other facts for a later detailed story instead of listing all claims.',
    contrast: 'Connect that detail to another supplied fact; avoid unsupported comparisons.',
    stop: 'End naturally on the meaning of the detail, with no generic CTA.',
    callback: 'Briefly connect to what was already heard without restating its opening or repeating its facts.',
  };
  const kinds = continuation ? ['callback' as const, 'context' as const, 'reveal' as const, 'stop' as const] : policy.preferredBeats;
  const items = verifiedItems(evidence);
  const shortItems = selectShortEvidence(items, policy.id);
  const selectedItems = options.level === 'short' ? shortItems : continuation
    ? items.filter(item => !shortItems.some(short => short.id === item.id))
    : items;
  return {
    subject: { id: input.poiId, name: input.placeName, category: evidence.category }, moment, level: options.level,
    narrativeAngle: `${continuation ? 'New context beyond the already-heard story' : city ? 'A grounded sense of this city' : evidence.category === 'bridge' ? policy.id === 'arthur' ? 'Engineering significance of a supported structural detail' : 'A supported visible feature opens an engineering story' : policy.id === 'arthur' ? 'Historical or architectural meaning of a precise detail' : 'A human-scale reveal connecting past and present'}; category=${evidence.category}; theme=${input.themeTags.join(',') || 'mixed'}`,
    beats: kinds.map(kind => ({ kind, objective: objectives[kind] ?? 'Use only a relevant supplied claim.' })),
    evidence: { ...evidence, items }, selectedEvidenceRefs: selectedItems.map(item => item.id), continuation,
    constraints: { targetDurationSec: input.targetDurationSec, language: options.language, forbiddenPatterns: [...narrativeV2.forbiddenPatterns] },
  };
}

function selectShortEvidence<T extends { id: string }>(items: T[], guideId: string): T[] {
  if (items.length <= 2) return items;
  // Arthur's short establishes the site/current-building distinction. Dana keeps the first
  // reveal and its immediate consequence. Ordering is stable from evidence normalization.
  return guideId === 'arthur' ? [items[0], items[2]] : items.slice(0, 2);
}
