import corpus from '../../evaluation/golden/narrative-v2.json';
import { normalizeEvidence } from '../src/services/evidence';
import { prepareNarrative } from '../src/services/narrativePlan';
import type { NarrativeLevel } from '@heycity/shared';
import type { StoryContinuationState } from '../src/services/storyBrief';

export function fixture(options: { id?: string; subject?: 'federal-hall' | 'golden-gate' | 'weak'; guide?: string; language?: string; level?: NarrativeLevel; mode?: 'walking' | 'vehicle'; continuation?: StoryContinuationState } = {}) {
  const subject = corpus.subjects[options.subject ?? 'federal-hall'];
  const id = options.id ?? options.subject ?? 'federal-hall';
  const evidence = normalizeEvidence({ id, name: subject.name, category: subject.category }, subject.claims.join(' '), 'curated', 'source' in subject ? subject.source : undefined);
  const language = options.language ?? 'en';
  return { ...prepareNarrative({ poiId: id, placeName: subject.name, mode: options.mode ?? 'walking', guideId: options.guide ?? 'dana', themeTags: ['history'], targetDurationSec: options.level === 'long' ? 120 : 30 }, evidence,
    { level: options.level ?? 'short', language, continuation: options.continuation }), language, narrationStyle: 'conversational' };
}
