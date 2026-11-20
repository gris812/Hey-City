import { aheadDiscovery } from '../config';

/** Mutable source policy. No discovery ranking or movement thresholds live here. */
export const knowledgePolicy = {
  version: 'knowledge-v4',
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

/** Bound source text sent to evidence normalization and balance the article sections. */
export function cityContextExcerpt(extract: string): string {
  const chunks = extract.split(/^={2,}\s*(.*?)\s*={2,}\s*$/m);
  if (chunks.length === 1) return extract;
  const forTheme = [/^history$/i, /^geography$/i, /^(?:economy|industry)$/i,
    /^(?:arts(?: and culture)?|culture)$/i, /^(?:parks and recreation|landmarks|points of interest|tourism)$/i];
  const sections: { heading: string; text: string }[] = [];
  for (let index = 1; index < chunks.length; index += 2) sections.push({ heading: chunks[index], text: chunks[index + 1] });
  const complete = (text: string, limit: number): string => {
    const clipped = text.trim().replace(/\s+/g, ' ').slice(0, limit);
    const endings = [...clipped.matchAll(/[.!?](?=\s+[A-Z]|$)/g)];
    const last = endings.at(-1);
    return last?.index === undefined ? '' : clipped.slice(0, last.index + 1);
  };
  const limit = Math.min(5000, aheadDiscovery.knowledgeMaxChars);
  const lead = complete(chunks[0], Math.floor(limit * 0.29));
  const body = forTheme.flatMap((pattern, index) => {
    const section = sections.find(block => pattern.test(block.heading));
    return section ? [complete(section.text, Math.floor(limit * (index === 0 ? 0.19 : 0.13)))] : [];
  });
  return [lead, ...body].filter(Boolean).join(' ');
}
