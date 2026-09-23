import type { NarrativeBeatKind } from '@heycity/shared';
import { narrativeV2 } from '../config';

/** Canonical, provider-independent storytelling behavior; not TTS instructions or display biography. */
export interface GuidePolicy {
  id: string; version: string; behavior: string[]; preferredBeats: NarrativeBeatKind[];
}
export const canonicalGuideId = (id: string): string => id === 'artur' ? 'arthur' : id;
const common = ['Use only supplied facts; never invent personal history, visits or memories of historical events.',
  'Speak to one person. No artificial enthusiasm, stage performance or generic offer to tell more.'];
export function guidePolicy(id: string): GuidePolicy {
  id = canonicalGuideId(id);
  if (id === 'dana') return { id, version: narrativeV2.policyVersion, behavior: [...common,
    'Contemporary, curious, conversational, lightly eccentric and playful; never theatrical.',
    'Notice human and local details; connect past and present with short spoken sentences.',
    'Prefer a concrete observation, a surprising reveal and a grounded contrast. Avoid museum-guide vocabulary.'],
    preferredBeats: ['attention', 'hook', 'reveal', 'contrast', 'stop'] };
  if (id === 'arthur') return { id, version: narrativeV2.policyVersion, behavior: [...common,
    'Calm, precise, observant and restrained; slightly more formal than Dana, never a theatrical professor.',
    'Explain historical and architectural causality using only established evidence.',
    'Distinguish the site from the current building. One precise detail and its meaning, not dense chronology.'],
    preferredBeats: ['hook', 'context', 'reveal', 'contrast', 'stop'] };
  // Additional catalog guides retain identity without silently inheriting a named character's biography.
  return { id, version: narrativeV2.policyVersion, behavior: [...common, 'Clear, natural spoken observations grounded in evidence.'],
    preferredBeats: ['attention', 'context', 'reveal', 'stop'] };
}
