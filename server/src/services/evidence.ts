import { createHash } from 'node:crypto';
import type { NarrativeAttribution, StoryAvailability } from '@heycity/shared';
import { narrativeV2 } from '../config';
import { callbackTopicsForEvidence } from '../policies/callbackTopicPolicy';

/** Server-only source material. Attribution must never be read aloud. */
export interface EvidenceItem {
  id: string; claim: string; sourceType: string; sourceUrl?: string; confidence: number;
}
export interface EvidenceBundle {
  subjectId: string; subjectName: string; category: string; items: EvidenceItem[];
  sourceVersion: string;
  attribution?: { label: string; url?: string };
}
export class InsufficientEvidenceError extends Error {
  readonly status = 422;
  constructor() { super('Not enough verified information about this place.'); }
}
export function normalizeEvidence(subject: { id: string; name: string; category: string }, text: string,
  sourceType: string, sourceUrl?: string): EvidenceBundle {
  // Legacy curated strings are accepted only at ingestion, never in the generation contract.
  const clean = text.replace(/^Category:.*(?:\r?\n|$)/gm, '').replace(/^Source:.*(?:\r?\n|$)/gm, '')
    .replace(/https?:\/\/\S+/g, '').trim();
  const sentences = segmentClaims(clean);
  return {
    subjectId: subject.id, subjectName: subject.name, category: subject.category,
    sourceVersion: narrativeV2.evidenceVersion,
    items: [...new Set(sentences)].map(claim => ({
      id: createHash('sha256').update(JSON.stringify([subject.id, sourceType, sourceUrl, claim])).digest('hex'),
      claim, sourceType, sourceUrl, confidence: 1,
    })),
    attribution: { label: sourceType === 'wikipedia' ? 'Wikipedia · CC BY-SA' : sourceType, url: sourceUrl },
  };
}
function segmentClaims(text: string): string[] {
  const dot = '\uE000';
  const protectedText = text
    .replace(/\b(?:[A-ZА-ЯЁ]\.){2,}/g, value => value.replaceAll('.', dot))
    .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|St|No|vs)\./gi, value => value.replace('.', dot));
  return protectedText.split(/(?<=[.!?])\s+(?=[A-ZА-ЯЁ])/u)
    .map(sentence => sentence.replaceAll(dot, '.').trim()).filter(Boolean);
}
export function verifiedItems(bundle: EvidenceBundle): EvidenceItem[] {
  const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const identity = new Set(words(`${bundle.subjectName} ${bundle.category} is a an the this it place nearby near you это место рядом с вами является`));
  return bundle.items.filter(item => Number.isFinite(item.confidence) && item.confidence >= narrativeV2.minConfidence &&
    item.claim.trim().length >= narrativeV2.minClaimChars &&
    words(item.claim).some(word => !identity.has(word)) &&
    item.claim.trim().toLowerCase() !== `${bundle.subjectName} ${bundle.category}`.toLowerCase() &&
    !/https?:\/\/|\b(?:Category|Source|CC BY-SA)\s*:/i.test(item.claim));
}
/** Narrow deterministic links supported by actual verified claims, never by profile tags alone. */
export function specificCallbackTopics(bundle: EvidenceBundle): string[] {
  return callbackTopicsForEvidence(bundle.category, verifiedItems(bundle).map(item => item.claim));
}
export function publicAttribution(bundle: EvidenceBundle): NarrativeAttribution | undefined {
  const label = bundle.attribution?.label.trim();
  if (!label) return undefined;
  const rawUrl = bundle.attribution?.url;
  if (!rawUrl) return { label };
  try {
    const url = new URL(rawUrl);
    return ['http:', 'https:'].includes(url.protocol) ? { label, url: url.toString() } : { label };
  } catch { return { label }; }
}

export function selectedEvidenceItems(bundle: EvidenceBundle, guideId: string, level: 'short' | 'long' | 'auto', continuing = false): EvidenceItem[] {
  const items = verifiedItems(bundle);
  const canonicalGuide = guideId === 'artur' ? 'arthur' : guideId;
  const shortItems = items.length <= 2 ? items : canonicalGuide === 'arthur' ? [items[0], items[2]] : items.slice(0, 2);
  if (level === 'short') return shortItems;
  if (level === 'long' && continuing) return items.filter(item => !shortItems.some(short => short.id === item.id));
  return items;
}

export function storyAvailability(bundle: EvidenceBundle, continuationGuideId?: string): StoryAvailability {
  const count = verifiedItems(bundle).length;
  const continuationCount = continuationGuideId
    ? selectedEvidenceItems(bundle, continuationGuideId, 'long', true).length
    : count;
  return {
    short: count >= narrativeV2.shortMinClaims,
    long: count >= narrativeV2.longMinClaims && continuationCount >= narrativeV2.continuationMinClaims,
  };
}
