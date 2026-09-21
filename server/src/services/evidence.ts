import { createHash } from 'node:crypto';
import type { StoryAvailability } from '@heycity/shared';
import { narrativeV2 } from '../config';

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
export function storyAvailability(bundle: EvidenceBundle): StoryAvailability {
  const count = verifiedItems(bundle).length;
  return { short: count >= narrativeV2.shortMinClaims, long: count >= narrativeV2.longMinClaims };
}
