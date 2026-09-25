import type {
  AheadDiscoveryTargetType,
  CandidateFilterResult,
  DiscoveryCandidate,
} from './aheadDiscoveryTypes';
import { aheadDiscoveryTaxonomy, providerTargetType } from '../policies/discoveryTaxonomyPolicy';

export function normalizeTargetType(providerTypes: string[]): AheadDiscoveryTargetType | null {
  return providerTargetType(providerTypes);
}

export function exclusionReason(candidate: DiscoveryCandidate): string | null {
  if (!candidate.isAhead) return 'behind_user';
  if (candidate.providerTypes.some((type) => aheadDiscoveryTaxonomy.forbiddenProviderTypes.includes(type)) && !normalizeTargetType(candidate.providerTypes)) return 'excluded_commercial_type';
  if (!normalizeTargetType(candidate.providerTypes)) return 'ambiguous_or_not_allowed';
  return null;
}

export function filterAheadCandidates(candidates: DiscoveryCandidate[]): CandidateFilterResult {
  const included: DiscoveryCandidate[] = [];
  const excluded: CandidateFilterResult['excluded'] = [];
  const summary: Record<string, number> = {};

  for (const candidate of candidates) {
    const reason = exclusionReason(candidate);
    if (!reason) {
      included.push(candidate);
      continue;
    }
    summary[reason] = (summary[reason] ?? 0) + 1;
    excluded.push({
      providerId: candidate.providerId,
      name: candidate.name,
      providerTypes: candidate.providerTypes,
      reason,
      distanceMeters: candidate.distanceMeters,
      headingDeltaDegrees: candidate.headingDeltaDegrees,
    });
  }

  return { included, excluded, summary };
}
