import type { DiscoveryCandidate, StoryDiscovery } from '@heycity/shared';
import { distanceMeters } from './geo';
import type { StoryBrief } from './storyBrief';

function normalizedName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Require an unambiguous name in both the selected verified claims and the actually generated story. */
export function resolveStoryDiscoveries(brief: StoryBrief, transcript: string, subject: { latitude: number; longitude: number },
  candidates: DiscoveryCandidate[], radiusMeters: number): StoryDiscovery[] {
  if (brief.moment.intent !== 'orient' && brief.depth?.scale !== 'city') return [];
  const selected = new Set(brief.selectedEvidenceRefs);
  const claims = brief.evidence.items.filter(item => selected.has(item.id)).map(item => ` ${normalizedName(item.claim)} `);
  const spoken = ` ${normalizedName(transcript)} `;
  const names = candidates.map(candidate => normalizedName(candidate.name));
  return candidates.flatMap((candidate, index) => {
    const name = names[index];
    if (candidate.providerId === brief.subject.id || !candidate.providerId || candidate.provider !== 'google' ||
        ['city', 'town', 'locality', 'region'].includes(candidate.targetType) ||
        name.length < 5 || names.indexOf(name) !== names.lastIndexOf(name) ||
        !Number.isFinite(candidate.latitude) || !Number.isFinite(candidate.longitude) ||
        Math.abs(candidate.latitude) > 90 || Math.abs(candidate.longitude) > 180 ||
        distanceMeters(subject.latitude, subject.longitude, candidate.latitude, candidate.longitude) > radiusMeters ||
        !spoken.includes(` ${name} `) || !claims.some(claim => claim.includes(` ${name} `))) return [];
    const { providerId, targetType, latitude, longitude } = candidate;
    return [{ providerId, name: candidate.name, targetType, latitude, longitude }];
  }).slice(0, 3);
}
