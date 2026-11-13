import { aheadDiscovery } from '../config';

/** Mutable source policy. No discovery ranking or movement thresholds live here. */
export const knowledgePolicy = {
  version: 'knowledge-v2',
  maxRequests: 8,
  maxSearchResults: 5,
  maxDocumentBytes: 128_000,
  overallTimeoutMs: 18_000,
  nameOverlap: 0.6,
  /** Operator-reviewed exact hosts only; never trust a model-supplied hostname. */
  officialHosts: (process.env.KNOWLEDGE_OFFICIAL_HOSTS ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean),
  researchEnabled: process.env.KNOWLEDGE_RESEARCH_ENABLED === 'true',
  researchCallsPerMinute: 2,
  radius(city: boolean): number {
    return city
      ? aheadDiscovery.cityContextRadiusMeters
      : aheadDiscovery.knowledgeMatchRadiusMeters;
  },
};
