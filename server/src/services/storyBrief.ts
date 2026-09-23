import type { MomentPlan, NarrativeBeat, NarrativeLevel, NarrativePlanInput } from '@heycity/shared';
import { narrativeV2 } from '../config';
import { EvidenceBundle, InsufficientEvidenceError, selectedEvidenceItems, storyAvailability, verifiedItems } from './evidence';
import { GuidePolicy } from './guidePolicy';
import type { JourneyContext, JourneyCallback } from './journeyContext';

export interface StoryContinuationState {
  poiId: string; guideId: string; language: string; previousLevel: 'short'; previousTranscript: string;
}
export interface StoryBrief {
  subject: { id: string; name: string; category: string };
  moment: MomentPlan; level: NarrativeLevel; narrativeAngle: string; beats: NarrativeBeat[];
  evidence: EvidenceBundle;
  /** Deterministically selected claims available to this segment; the full bundle stays server-only. */
  selectedEvidenceRefs: string[];
  journey?: {
    area?: JourneyContext['area'];
    recentEntityRefs: string[];
    recentTopicKeys: string[];
    usedEvidenceRefs: string[];
    callback?: JourneyCallback;
    recentNarrativeSignatures: string[];
  };
  continuation?: { previousLevel: 'short'; previousTranscript: string };
  constraints: { targetDurationSec: number; language: string; forbiddenPatterns: string[] };
}
/** Pure planning: no discovery, provider calls, extra facts or raw-source parsing. */
export function buildStoryBrief(input: NarrativePlanInput, evidence: EvidenceBundle, policy: GuidePolicy,
  options: { level: NarrativeLevel; language: string; continuation?: StoryContinuationState; journey?: JourneyContext }): StoryBrief {
  if (input.poiId !== evidence.subjectId || input.placeName !== evidence.subjectName) throw new Error('Evidence target mismatch');
  const prior = options.continuation;
  const continuation = options.level === 'long' && prior?.poiId === input.poiId && prior.guideId === policy.id && prior.language === options.language
    ? { previousLevel: 'short' as const, previousTranscript: prior.previousTranscript } : undefined;
  const available = storyAvailability(evidence, continuation ? policy.id : undefined);
  if (!(options.level === 'long' ? available.long : available.short)) throw new InsufficientEvidenceError();
  const city = evidence.category === 'city' || evidence.category === 'region';
  const journey = options.journey;
  const topics = [...new Set([...input.themeTags.filter(tag => tag !== 'mixed'), evidence.category])];
  const callback = continuation ? undefined : journey?.callbacks.find(item => item.sourceEntityId !== input.poiId && topics.includes(item.topicKey));
  const moment: MomentPlan = {
    relationship: continuation ? 'continuation' : callback ? callback.relationship : city ? 'orientation' : 'new_topic',
    intent: continuation || callback ? 'connect' : city ? 'orient' : policy.id === 'arthur' ? 'explain' : 'surprise',
    delivery: options.level === 'long' && input.mode !== 'vehicle' ? 'deep_story' : 'brief_story',
    ...(callback || continuation ? { priorContextRefs: callback ? [callback.sourceMomentId, callback.sourceEntityId] : [input.poiId] } : {}),
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
  const defaultKinds = callback ? ['callback' as const, 'context' as const, 'reveal' as const, 'stop' as const] : policy.preferredBeats;
  let kinds = continuation ? ['callback' as const, 'context' as const, 'reveal' as const, 'stop' as const] : defaultKinds;
  const signature = `${policy.id}:${moment.relationship}:${moment.intent}:${kinds.join(',')}`;
  if (!continuation && !callback && journey?.recent.narrativeSignatures.at(-1) === signature) {
    kinds = ['context', 'contrast', 'reveal', 'stop'];
  }
  const items = verifiedItems(evidence);
  const used = new Set(journey?.usedEvidenceRefs ?? []);
  const preferredItems = selectedEvidenceItems(evidence, policy.id, options.level, Boolean(continuation));
  const unusedItems = (used.size && !continuation && options.level !== 'auto'
    ? verifiedItems(evidence).filter(item => !used.has(item.id)).slice(0, options.level === 'short' ? 2 : undefined)
    : preferredItems.filter(item => !used.has(item.id)));
  // An explicit user choice may replay an already-heard story; automatic narration may not.
  // A continuation always uses M1's strictly unused short-segment evidence selection.
  const selectedItems = continuation ? preferredItems :
    unusedItems.length >= narrativeV2.shortMinClaims ? unusedItems :
      options.level === 'auto' ? [] : preferredItems;
  if (selectedItems.length < (continuation ? narrativeV2.continuationMinClaims : narrativeV2.shortMinClaims)) throw new InsufficientEvidenceError();
  return {
    subject: { id: input.poiId, name: input.placeName, category: evidence.category }, moment, level: options.level,
    narrativeAngle: `${continuation ? 'New context beyond the already-heard story' : city ? 'A grounded sense of this city' : evidence.category === 'bridge' ? policy.id === 'arthur' ? 'Engineering significance of a supported structural detail' : 'A supported visible feature opens an engineering story' : policy.id === 'arthur' ? 'Historical or architectural meaning of a precise detail' : 'A human-scale reveal connecting past and present'}; category=${evidence.category}; theme=${input.themeTags.join(',') || 'mixed'}`,
    beats: kinds.map(kind => ({ kind, objective: objectives[kind] ?? 'Use only a relevant supplied claim.' })),
    evidence: { ...evidence, items }, selectedEvidenceRefs: selectedItems.map(item => item.id), continuation,
    ...(journey ? { journey: {
      area: journey.area.source === 'unknown' ? undefined : journey.area,
      recentEntityRefs: journey.recent.entities.map(item => item.entityId),
      recentTopicKeys: journey.recent.topics.map(item => item.key),
      usedEvidenceRefs: [...used], callback,
      recentNarrativeSignatures: [...journey.recent.narrativeSignatures],
    } } : {}),
    constraints: { targetDurationSec: input.targetDurationSec, language: options.language, forbiddenPatterns: [...narrativeV2.forbiddenPatterns] },
  };
}
