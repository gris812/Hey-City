import type { NarrativeBeatKind } from '@heycity/shared';
import { narrativeV2 } from '../config';
import { canonicalGuideNarrativeId, COMMON_GUIDE_CONSTRAINTS, guideNarrativeDefinition } from '../policies/guideNarrativePolicy';

/** Canonical, provider-independent storytelling behavior; not TTS instructions or display biography. */
export interface GuidePolicy {
  id: string; version: string; behavior: string[]; preferredBeats: NarrativeBeatKind[];
}
export const canonicalGuideId = canonicalGuideNarrativeId;
export function guidePolicy(id: string): GuidePolicy {
  id = canonicalGuideId(id);
  const definition = guideNarrativeDefinition(id);
  return { id, version: narrativeV2.policyVersion, behavior: [...COMMON_GUIDE_CONSTRAINTS, ...definition.behavior],
    preferredBeats: [...definition.preferredBeats] };
}
