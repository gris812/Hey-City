import type {
  AheadDiscoveryDiagnostic,
  AheadDiscoveryExcludedCandidate,
  AheadDiscoveryTargetType,
  CandidateGeometry,
  DiscoveryCandidate,
  MovementContext,
} from '@heycity/shared';

export type {
  AheadDiscoveryDiagnostic,
  AheadDiscoveryExcludedCandidate,
  AheadDiscoveryTargetType,
  CandidateGeometry,
  DiscoveryCandidate,
  MovementContext,
};

export type ProviderDiscoveryCandidate = Omit<
  DiscoveryCandidate,
  'distanceMeters' | 'bearingDegrees' | 'headingDeltaDegrees' | 'isAhead'
>;

export type SearchAheadInput = {
  movement: MovementContext;
  projectedPoint: { latitude: number; longitude: number };
  radiusMeters: number;
  limit: number;
};

export interface DiscoveryDataProvider {
  readonly name: 'google';
  searchAhead(input: SearchAheadInput): Promise<ProviderDiscoveryCandidate[]>;
}

export type CandidateEvaluation = {
  candidate: DiscoveryCandidate;
  score: number;
  reasons: string[];
};

export type CandidateFilterResult = {
  included: DiscoveryCandidate[];
  excluded: AheadDiscoveryExcludedCandidate[];
  summary: Record<string, number>;
};
