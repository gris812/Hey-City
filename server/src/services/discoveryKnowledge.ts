import { createHash } from 'node:crypto';
import type { DiscoveryCandidate } from '@heycity/shared';
import { aheadDiscovery } from '../config';
import { cacheGet, cacheSet } from './cache';
import { distanceMeters } from './geo';
import { recordUsage } from './usage';
import {
  EvidenceBundle,
  normalizeEvidence,
  storyAvailability,
  verifiedItems,
} from './evidence';
import { knowledgePolicy } from '../policies/knowledgePolicy';
import {
  KnowledgeResearchAdapter,
  ResolvedKnowledgeEntity,
  RoutedKnowledgeResearch,
  officialSourceUrl,
  sourceText,
} from './knowledgeSources';

export type KnowledgeLevel = 'L1' | 'L2' | 'L3' | 'L4';
export type KnowledgeAttempt = {
  level: KnowledgeLevel;
  status: 'matched' | 'insufficient' | 'no_match' | 'error' | 'disabled';
  latencyMs: number;
};
export interface KnowledgeResult {
  evidence: EvidenceBundle | null;
  attempts: KnowledgeAttempt[];
  entity?: ResolvedKnowledgeEntity;
}
type Page = {
  pageid?: number;
  title?: string;
  extract?: string;
  pageprops?: { disambiguation?: string; wikibase_item?: string };
  coordinates?: Array<{ lat: number; lon: number }>;
};
const pending = new Map<string, Promise<KnowledgeResult>>();
let research: KnowledgeResearchAdapter = new RoutedKnowledgeResearch();
let researchWindow = { at: 0, calls: 0 };
export function setKnowledgeResearchAdapter(
  adapter: KnowledgeResearchAdapter,
): void {
  research = adapter;
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/\bst[.]?\b/g, 'saint')
      .replace(/[^\p{L}\p{N} ]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !['the', 'and', 'of'].includes(w)),
  );
export function knowledgeNameMatches(
  wantedName: string,
  title: string,
): boolean {
  const wanted = words(wantedName.split(',')[0]);
  const actual = words(title.split(/[,()]/)[0]);
  return (
    [...wanted].filter((w) => actual.has(w)).length /
      Math.max(wanted.size, actual.size, 1) >=
    knowledgePolicy.nameOverlap
  );
}

/** Compatibility facade used by automatic and explicit production narration alike. */
export async function discoveryEvidence(
  candidate: DiscoveryCandidate,
): Promise<EvidenceBundle | null> {
  return (await retrieveDiscoveryKnowledge(candidate)).evidence;
}

export async function retrieveDiscoveryKnowledge(
  candidate: DiscoveryCandidate,
): Promise<KnowledgeResult> {
  const identity = JSON.stringify([
    candidate.providerId,
    candidate.name,
    candidate.targetType,
    candidate.latitude,
    candidate.longitude,
  ]);
  const key = `discovery-knowledge:${knowledgePolicy.version}:${createHash('sha256').update(identity).digest('hex')}`;
  const cached = await cacheGet<KnowledgeResult>(key);
  if (cached)
    return {
      ...cached,
      attempts: [
        {
          level: 'L1',
          status: cached.evidence ? 'matched' : 'no_match',
          latencyMs: 0,
        },
      ],
    };
  if (pending.has(key)) return pending.get(key)!;
  const task = acquire(candidate);
  pending.set(key, task);
  try {
    const result = await task;
    await cacheSet(
      key,
      result,
      result.evidence && storyAvailability(result.evidence).short
        ? aheadDiscovery.knowledgeCacheSeconds
        : aheadDiscovery.providerErrorBackoffSeconds,
    );
    return result;
  } finally {
    pending.delete(key);
  }
}

async function acquire(
  candidate: DiscoveryCandidate,
): Promise<KnowledgeResult> {
  const attempts: KnowledgeAttempt[] = [];
  const signal = AbortSignal.timeout(knowledgePolicy.overallTimeoutMs);
  let requests = 0;
  const get = async (url: URL): Promise<Response> => {
    if (++requests > knowledgePolicy.maxRequests)
      throw new Error('knowledge_request_budget');
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(aheadDiscovery.knowledgeTimeoutMs),
      ]),
      headers: { 'User-Agent': 'HeyCity/0.1 (https://heycity.stolbergco.com)' },
    });
    if (!response.ok) throw new Error('knowledge_provider_unavailable');
    return response;
  };
  // Bound response bodies even when Content-Length is absent or false.
  const read = async (response: Response): Promise<string> => {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.length;
        if (size > knowledgePolicy.maxDocumentBytes)
          throw new Error('knowledge_body_limit');
        chunks.push(item.value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks).toString('utf8');
  };
  const json = async (url: URL) => JSON.parse(await read(await get(url)));
  let evidence: EvidenceBundle | null = null;
  let entity: ResolvedKnowledgeEntity | undefined;
  const absorb = (text: string, type: string, url: string) => {
    const bundle = normalizeEvidence(
      {
        id: candidate.providerId,
        name: candidate.name,
        category: candidate.targetType,
      },
      text.slice(0, aheadDiscovery.knowledgeMaxChars),
      type,
      url,
    );
    if (!evidence) {
      evidence = bundle;
      return;
    }
    const seen = new Set(evidence.items.map((item) => item.claim));
    const additions = bundle.items.filter((item) => !seen.has(item.claim));
    if (!additions.length) return;
    evidence = {
      ...evidence,
      items: [...evidence.items, ...additions],
      attribution:
        evidence.attribution?.url === url
          ? evidence.attribution
          : { label: 'Multiple sources' },
    };
  };
  const enough = () => !!evidence && storyAvailability(evidence).long;
  const radius = knowledgePolicy.radius(
    ['city', 'town', 'locality', 'region'].includes(candidate.targetType),
  );
  const matchesCoordinates = (lat: number, lon: number) =>
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    distanceMeters(candidate.latitude, candidate.longitude, lat, lon) <= radius;
  const inspectPages = (data: { query?: { pages?: Record<string, Page> } }) => {
    for (const page of Object.values(data.query?.pages ?? {})) {
      const coord = page.coordinates?.[0];
      const structuredBinding =
        entity?.wikidataId &&
        page.pageprops?.wikibase_item === entity.wikidataId;
      if (
        !page.pageid ||
        page.pageprops?.disambiguation !== undefined ||
        (!structuredBinding &&
          (!coord ||
            !matchesCoordinates(coord.lat, coord.lon) ||
            !knowledgeNameMatches(candidate.name, page.title ?? ''))) ||
        (coord && !matchesCoordinates(coord.lat, coord.lon)) ||
        (entity?.pageId && entity.pageId !== page.pageid)
      )
        continue;
      entity = {
        ...entity,
        name: page.title ?? candidate.name,
        pageId: page.pageid,
        wikidataId: page.pageprops?.wikibase_item,
      };
      if (
        page.extract &&
        page.extract.length >= aheadDiscovery.knowledgeMinChars
      )
        absorb(
          page.extract,
          'wikipedia',
          `https://en.wikipedia.org/?curid=${page.pageid}`,
        );
      break;
    }
  };
  const wiki = (params: Record<string, string>) => {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      redirects: '1',
      prop: 'extracts|coordinates|pageprops',
      exintro: '1',
      explaintext: '1',
      ...params,
    }).toString();
    return url;
  };
  let started = Date.now();
  let l2Error = false;
  // Keep full locality qualifiers. Text search resolves Doral -> Doral, Florida without guessing a production city.
  const queries = [
    () => wiki({ titles: candidate.name }),
    () =>
      wiki({
        generator: 'search',
        gsrsearch: candidate.name,
        gsrnamespace: '0',
        gsrlimit: String(knowledgePolicy.maxSearchResults),
      }),
    () =>
      wiki({
        generator: 'geosearch',
        ggscoord: `${candidate.latitude}|${candidate.longitude}`,
        ggsradius: String(Math.min(10000, radius)),
        ggslimit: '10',
      }),
  ];
  for (const query of queries) {
    if (enough()) break;
    try {
      inspectPages(await json(query()));
    } catch {
      l2Error = true;
    }
  }
  // A missing Wikipedia match is not proof of absent knowledge. Resolve a structured
  // Wikidata entity independently, still requiring matching name and coordinates.
  if (!entity) {
    try {
      const searchUrl = new URL('https://www.wikidata.org/w/api.php');
      searchUrl.search = new URLSearchParams({
        action: 'wbsearchentities',
        format: 'json',
        language: 'en',
        search: candidate.name,
        limit: '3',
      }).toString();
      const search = await json(searchUrl);
      const ids = (search.search ?? [])
        .map((x: { id: string }) => x.id)
        .filter((id: string) => /^Q[0-9]+$/.test(id))
        .slice(0, 3);
      if (ids.length) {
        const detailUrl = new URL('https://www.wikidata.org/w/api.php');
        detailUrl.search = new URLSearchParams({
          action: 'wbgetentities',
          format: 'json',
          ids: ids.join('|'),
          props: 'labels|claims|sitelinks',
          languages: 'en',
        }).toString();
        const details = await json(detailUrl);
        for (const id of ids) {
          const item = details.entities?.[id];
          const name = item?.labels?.en?.value ?? '';
          const coord = item?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
          if (
            !coord ||
            !knowledgeNameMatches(candidate.name, name) ||
            !matchesCoordinates(coord.latitude, coord.longitude)
          )
            continue;
          entity = {
            name,
            wikidataId: id,
            officialUrl: item?.claims?.P856?.[0]?.mainsnak?.datavalue?.value,
          };
          const article = item?.sitelinks?.enwiki?.title;
          if (typeof article === 'string')
            inspectPages(await json(wiki({ titles: article })));
          break;
        }
      }
    } catch {
      l2Error = true;
    }
  }
  attempts.push({
    level: 'L2',
    status: evidence
      ? enough()
        ? 'matched'
        : 'insufficient'
      : l2Error
        ? 'error'
        : 'no_match',
    latencyMs: Date.now() - started,
  });
  started = Date.now();
  // Wikidata official-site relationship is tied to the coordinate/name-validated entity.
  if (!enough() && entity?.wikidataId && knowledgePolicy.officialHosts.length) {
    try {
      const wd = new URL(
        `https://www.wikidata.org/wiki/Special:EntityData/${entity.wikidataId}.json`,
      );
      const data = entity.officialUrl ? undefined : await json(wd);
      const claims = entity.officialUrl
        ? [{ mainsnak: { datavalue: { value: entity.officialUrl } } }]
        : (data?.entities?.[entity.wikidataId]?.claims?.P856 ?? []);
      for (const claim of claims.slice(0, 1)) {
        const url = officialSourceUrl(claim.mainsnak?.datavalue?.value);
        if (!url) continue;
        const html = await read(await get(url));
        const paragraphs = (html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [])
          .map(sourceText)
          .filter((text) =>
            [...words(candidate.name.split(',')[0])].every((word) =>
              words(text).has(word),
            ),
          );
        if (paragraphs.length)
          absorb(paragraphs.slice(0, 3).join(' '), 'official', url.toString());
      }
      attempts.push({
        level: 'L3',
        status: enough() ? 'matched' : 'insufficient',
        latencyMs: Date.now() - started,
      });
    } catch {
      attempts.push({
        level: 'L3',
        status: 'error',
        latencyMs: Date.now() - started,
      });
    }
  } else if (!enough())
    attempts.push({ level: 'L3', status: 'disabled', latencyMs: 0 });
  if (!enough()) {
    started = Date.now();
    if (Date.now() - researchWindow.at > 60000)
      researchWindow = { at: Date.now(), calls: 0 };
    if (
      knowledgePolicy.researchEnabled &&
      entity &&
      knowledgePolicy.officialHosts.length &&
      researchWindow.calls < knowledgePolicy.researchCallsPerMinute &&
      requests < knowledgePolicy.maxRequests &&
      !signal.aborted
    ) {
      researchWindow.calls++;
      try {
        const proposals = await research.propose(candidate, entity, signal);
        for (const proposal of proposals.slice(0, 2)) {
          const url = officialSourceUrl(proposal.url);
          if (!url) continue;
          const text = sourceText(await read(await get(url)));
          const quote = sourceText(proposal.quote);
          // Never promote model output by citation alone. Require exact independently fetched support and subject mention.
          if (
            quote.length >= 40 &&
            text.includes(quote) &&
            [...words(candidate.name.split(',')[0])].every((word) =>
              words(quote).has(word),
            )
          )
            absorb(quote, 'official_research', url.toString());
        }
        attempts.push({
          level: 'L4',
          status: enough() ? 'matched' : 'insufficient',
          latencyMs: Date.now() - started,
        });
      } catch {
        attempts.push({
          level: 'L4',
          status: 'error',
          latencyMs: Date.now() - started,
        });
      }
    } else attempts.push({ level: 'L4', status: 'disabled', latencyMs: 0 });
  }
  const finalEvidence: EvidenceBundle | null = evidence;
  await recordUsage({
    category: 'product',
    operation:
      finalEvidence && verifiedItems(finalEvidence).length
        ? 'knowledge_matched'
        : 'knowledge_no_match',
    metadata: {
      policyVersion: knowledgePolicy.version,
      sourceSha: process.env.GIT_SHA ?? 'unknown',
      attempts,
      requestCount: requests,
    },
  }).catch(() => console.warn('knowledge_telemetry_unavailable'));
  return { evidence: finalEvidence, attempts, entity };
}

export async function discoveryStorySeed(
  candidate: DiscoveryCandidate,
): Promise<string | null> {
  const evidence = await discoveryEvidence(candidate);
  return evidence ? evidence.items.map((item) => item.claim).join(' ') : null;
}
