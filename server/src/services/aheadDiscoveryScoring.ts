import { aheadDiscovery } from '../config';
import { discoverySearchProfile } from './discoverySearchProfile';
import type { MovementContext } from './aheadDiscoveryTypes';
import type { CandidateEvaluation, DiscoveryCandidate } from './aheadDiscoveryTypes';
import { DISCOVERY_CATEGORY_PRIORITY, DISCOVERY_CATEGORY_PRIORITY_FALLBACK,
  DISCOVERY_CATEGORY_PRIORITY_RANGE, DISCOVERY_POPULARITY_POLICY } from '../policies/discoveryRankingPolicy';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function popularityScore(rating?: number, userRatingCount?: number): number {
  return clamp01(
    ((rating ?? 0) / DISCOVERY_POPULARITY_POLICY.ratingMaximum) * DISCOVERY_POPULARITY_POLICY.ratingWeight +
    Math.min(userRatingCount ?? 0, DISCOVERY_POPULARITY_POLICY.ratingCountCap) /
      DISCOVERY_POPULARITY_POLICY.ratingCountCap * DISCOVERY_POPULARITY_POLICY.ratingCountWeight
  );
}

export function scoreCandidate(
  candidate: DiscoveryCandidate,
  currentTargetId?: string,
  movement?: MovementContext
): CandidateEvaluation {
  const reasons: string[] = [];
  const profile = movement ? discoverySearchProfile(movement) : undefined;
  const aheadScore = profile?.id === 'walking' ? 1 : candidate.isAhead
    ? clamp01(1 - candidate.headingDeltaDegrees / Math.max(1, profile?.headingLimit ?? aheadDiscovery.maxHeadingDeltaDegrees))
    : 0;
  if (candidate.isAhead) reasons.push('candidate ahead of movement heading');

  const range = Math.max(
    1,
    aheadDiscovery.targetDistanceMaxM - aheadDiscovery.targetDistanceMinM
  );
  const distanceScore = clamp01(
    1 - Math.abs(candidate.distanceMeters - aheadDiscovery.targetDistanceMinM) / range
  );
  if (
    candidate.distanceMeters >= aheadDiscovery.targetDistanceMinM &&
    candidate.distanceMeters <= aheadDiscovery.targetDistanceMaxM
  ) {
    reasons.push('distance inside prototype corridor');
  }

  const priority = DISCOVERY_CATEGORY_PRIORITY[candidate.targetType] ?? DISCOVERY_CATEGORY_PRIORITY_FALLBACK;
  const categoryScore = 1 - (priority - 1) / DISCOVERY_CATEGORY_PRIORITY_RANGE;
  reasons.push(`category priority ${priority}`);

  const popularity = popularityScore(candidate.rating, candidate.userRatingCount);

  const stabilityScore = currentTargetId === candidate.providerId ? 1 : 0;
  if (stabilityScore) reasons.push('retained current target stability bonus');

  const score =
    aheadDiscovery.weights.ahead * aheadScore +
    aheadDiscovery.weights.distance * distanceScore +
    aheadDiscovery.weights.category * categoryScore +
    aheadDiscovery.weights.popularity * popularity +
    aheadDiscovery.weights.stability * stabilityScore;

  return {
    candidate,
    score: Math.round(score * 1000) / 1000,
    reasons,
  };
}

export function chooseBestCandidate(
  candidates: DiscoveryCandidate[],
  currentTarget?: DiscoveryCandidate,
  movement?: MovementContext
): { selected: CandidateEvaluation | null; replaced: boolean; retained: boolean } {
  const scored = rankCandidates(candidates, currentTarget?.providerId, movement);
  const best = scored[0];
  if (!best) return { selected: null, replaced: false, retained: false };

  if (!currentTarget) return { selected: best, replaced: false, retained: false };
  if (!currentTarget.isAhead) return { selected: best, replaced: true, retained: false };

  const current = scored.find((item) => item.candidate.providerId === currentTarget.providerId);
  if (current && best.candidate.providerId !== current.candidate.providerId) {
    const margin = best.score - current.score;
    if (margin < aheadDiscovery.targetSwitchScoreMargin) {
      return { selected: current, replaced: false, retained: true };
    }
    return { selected: best, replaced: true, retained: false };
  }

  return {
    selected: current ?? best,
    replaced: false,
    retained: Boolean(current),
  };
}

export function rankCandidates(candidates: DiscoveryCandidate[], currentTargetId?: string,
  movement?: MovementContext): CandidateEvaluation[] {
  return candidates
    .map((candidate) => scoreCandidate(candidate, currentTargetId, movement))
    .sort((a, b) => b.score - a.score);
}
