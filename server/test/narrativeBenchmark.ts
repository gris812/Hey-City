/** Evaluation orchestration only. Generation/planning/retrieval remain production implementations. */
import type { DiscoveryCandidate } from '@heycity/shared';
import catalog from '../../evaluation/narrative/entities.json';
import { NARRATIVE_EXPERIENCE_WEIGHTS } from '../src/policies/narrativeQualityPolicy';

export const BENCHMARK_RUBRIC = {
  version: 'narrative-experience-v1',
  weights: NARRATIVE_EXPERIENCE_WEIGHTS,
  gates: [
    'No fabricated landmark, material historical falsehood, invented quote or misleading attribution.',
    'No unsafe driving interaction or false location/navigation instruction.',
  ],
  instruction:
    'Score interesting natural spoken entertainment, not encyclopedic precision. Conversational rounding is acceptable unless materially misleading. Evaluate each dimension independently. Explain weaknesses and uncertainty. Gemini is not ground truth. Refer factual claims to retained source evidence; unsupported is not automatically false. Human review is required for disputed gates.',
};
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled<T>(values: T[], random: () => number): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export interface BenchmarkEntity {
  candidate: DiscoveryCandidate;
  group: 'nearby' | 'random' | 'regression';
  region?: string;
  evidenceStratum?: string;
}
export function benchmarkCandidate(
  id: string,
  name: string,
  type: DiscoveryCandidate['targetType'],
  latitude: number,
  longitude: number,
): DiscoveryCandidate {
  return {
    providerId: id,
    provider: 'google',
    name,
    targetType: type,
    latitude,
    longitude,
    providerTypes: [],
    distanceMeters: 0,
    bearingDegrees: 0,
    headingDeltaDegrees: 180,
    isAhead: false,
  };
}
/** Versioned public entity frame, region/type/evidence-coverage strata; never used by Discovery. */
export function randomEntities(seed: number, count = 10): BenchmarkEntity[] {
  const random = seededRandom(seed);
  const rows = shuffled(catalog.entities, random);
  const regions = shuffled([...new Set(rows.map((r) => String(r[4])))], random);
  const out: BenchmarkEntity[] = [];
  const selected = new Set<string>();
  const strata = new Set<string>();
  for (let round = 0; out.length < count && round < rows.length; round++)
    for (const region of regions) {
      if (out.length >= count) break;
      const row = rows.find(
        (r) =>
          r[4] === region &&
          !selected.has(String(r[0])) &&
          (round === 0 || !strata.has(`${r[1]}:${r[5]}`) || round > 2),
      );
      if (!row) continue;
      selected.add(String(row[0]));
      strata.add(`${row[1]}:${row[5]}`);
      out.push({
        candidate: benchmarkCandidate(
          `benchmark:${row[0]}`,
          String(row[0]),
          row[1] as DiscoveryCandidate['targetType'],
          Number(row[2]),
          Number(row[3]),
        ),
        group: 'random',
        region,
        evidenceStratum: String(row[5]),
      });
    }
  if (out.length !== count) throw new Error('Insufficient sampling frame');
  return out;
}
export async function nearbyEntities(
  latitude: number,
  longitude: number,
  seed: number,
  count = 10,
): Promise<BenchmarkEntity[]> {
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  )
    throw new Error('Explicit valid test coordinate required');
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'geosearch',
    ggscoord: `${latitude}|${longitude}`,
    ggsradius: '10000',
    ggslimit: '50',
    prop: 'coordinates',
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'HeyCityBenchmark/0.1' },
  });
  if (!response.ok) throw new Error('Nearby sampling unavailable');
  const data = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          pageid: number;
          title: string;
          coordinates?: Array<{ lat: number; lon: number }>;
        }
      >;
    };
  };
  const pages = Object.values(data.query?.pages ?? {})
    .filter((p) => p.coordinates?.length)
    .sort((a, b) => a.pageid - b.pageid);
  if (pages.length < count)
    throw new Error(
      'Not enough nearby geotagged entities; supply a recorded fixture or another explicit coordinate',
    );
  return shuffled(pages, seededRandom(seed))
    .slice(0, count)
    .map((p) => ({
      candidate: benchmarkCandidate(
        `wikipedia:${p.pageid}`,
        p.title,
        'other_significant_place',
        p.coordinates![0].lat,
        p.coordinates![0].lon,
      ),
      group: 'nearby',
    }));
}
export function blindPair(
  left: string,
  right: string,
  seed: number,
): {
  answers: { A: string; B: string };
  mapping: { A: 'heycity' | 'gemini'; B: 'heycity' | 'gemini' };
} {
  return seededRandom(seed)() < 0.5
    ? { answers: { A: left, B: right }, mapping: { A: 'heycity', B: 'gemini' } }
    : {
        answers: { A: right, B: left },
        mapping: { A: 'gemini', B: 'heycity' },
      };
}
export function validateReview(value: unknown): number {
  const v = value as {
    scores?: Record<string, number>;
    factuality?: string;
    safety?: string;
  };
  if (
    !v?.scores ||
    !['pass', 'fail', 'uncertain'].includes(v.factuality ?? '') ||
    !['pass', 'fail', 'uncertain'].includes(v.safety ?? '')
  )
    throw new Error('Missing independent gates');
  let total = 0;
  for (const [key, max] of Object.entries(NARRATIVE_EXPERIENCE_WEIGHTS)) {
    const n = v.scores[key];
    if (!Number.isFinite(n) || n < 0 || n > max)
      throw new Error('Invalid rubric score');
    total += n;
  }
  return total;
}
export const samplingVersion = catalog.version;
