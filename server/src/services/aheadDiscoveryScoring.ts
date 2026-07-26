import { aheadDiscovery } from '../config';
import type { CandidateEvaluation, DiscoveryCandidate } from './aheadDiscoveryTypes';

const categoryPriority: Record<DiscoveryCandidate['targetType'], number> = {
  city: 1,
  town: 1,
  locality: 1,
  region: 2,
  national_park: 2,
  natural_feature: 2,
  historical_landmark: 3,
  cultural_landmark: 3,
  state_park: 4,
  bridge: 4,
  monument: 5,
  visitor_center: 5,
  museum: 6,
  university: 6,
  park: 7,
  other_significant_place: 8,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function scoreCandidate(
  candidate: DiscoveryCandidate,
  currentTargetId?: string
): CandidateEvaluation {
  const reasons: string[] = [];
  const aheadScore = candidate.isAhead
    ? 1 - candidate.headingDeltaDegrees / Math.max(1, aheadDiscovery.maxHeadingDeltaDegrees)
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

  const priority = categoryPriority[candidate.targetType] ?? 8;
  const categoryScore = 1 - (priority - 1) / 7;
  reasons.push(`category priority ${priority}`);

  const popularityScore = clamp01(
    ((candidate.rating ?? 0) / 5) * 0.35 +
      Math.min(candidate.userRatingCount ?? 0, 5000) / 5000 * 0.65
  );

  const stabilityScore = currentTargetId === candidate.providerId ? 1 : 0;
  if (stabilityScore) reasons.push('retained current target stability bonus');

  const score =
    aheadDiscovery.weights.ahead * aheadScore +
    aheadDiscovery.weights.distance * distanceScore +
    aheadDiscovery.weights.category * categoryScore +
    aheadDiscovery.weights.popularity * popularityScore +
    aheadDiscovery.weights.stability * stabilityScore;

  return {
    candidate,
    score: Math.round(score * 1000) / 1000,
    reasons,
  };
}

export function chooseBestCandidate(
  candidates: DiscoveryCandidate[],
  currentTarget?: DiscoveryCandidate
): { selected: CandidateEvaluation | null; replaced: boolean; retained: boolean } {
  const scored = candidates
    .map((candidate) => scoreCandidate(candidate, currentTarget?.providerId))
    .sort((a, b) => b.score - a.score);
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
