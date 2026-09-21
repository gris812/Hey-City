import type { DiscoveryCandidate } from '@heycity/shared';
import { aheadDiscovery } from '../config';
import { cacheGet, cacheSet } from './cache';
import { distanceMeters } from './geo';
import { recordUsage } from './usage';
import { EvidenceBundle, normalizeEvidence } from './evidence';

const pending = new Map<string, Promise<EvidenceBundle | null>>();

/** Exact-title lookup with redirects and coordinate validation; never invent a seed from a name. */
export async function discoveryEvidence(candidate: DiscoveryCandidate): Promise<EvidenceBundle | null> {
  const key = `discovery-knowledge:m1:${candidate.providerId}`;
  const cached = await cacheGet<{ seed: EvidenceBundle | null }>(key);
  if (cached) return cached.seed;
  if (pending.has(key)) return pending.get(key)!;
  const task = (async () => {
    let seed: EvidenceBundle | null = null;
    try {
      const url = new URL('https://en.wikipedia.org/w/api.php');
      url.search = new URLSearchParams({ action: 'query', format: 'json', redirects: '1',
        prop: 'extracts|coordinates|pageprops', exintro: '1', explaintext: '1',
        titles: candidate.targetType === 'city' ? candidate.name.split(',')[0].trim() : candidate.name,
      }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(aheadDiscovery.knowledgeTimeoutMs),
        headers: { 'User-Agent': 'HeyCity/0.1 (https://heycity.stolbergco.com)' } });
      if (!response.ok) throw new Error('knowledge_unavailable');
      const data = await response.json() as { query?: { pages?: Record<string, {
        pageid?: number; title?: string; extract?: string; pageprops?: { disambiguation?: string };
        coordinates?: Array<{ lat: number; lon: number }>;
      }> } };
      for (const page of Object.values(data.query?.pages ?? {})) {
        const coord = page.coordinates?.[0];
        const tolerance = candidate.targetType === 'city' ? aheadDiscovery.cityContextRadiusMeters : aheadDiscovery.knowledgeMatchRadiusMeters;
        if (!coord || !page.pageid || page.pageprops?.disambiguation !== undefined || !page.extract || page.extract.length < aheadDiscovery.knowledgeMinChars) continue;
        if (distanceMeters(candidate.latitude, candidate.longitude, coord.lat, coord.lon) > tolerance) continue;
        seed = normalizeEvidence({ id: candidate.providerId, name: candidate.name, category: candidate.targetType }, page.extract.slice(0, aheadDiscovery.knowledgeMaxChars), 'wikipedia', `https://en.wikipedia.org/?curid=${page.pageid}`);
        break;
      }
      if (!seed) {
        // A Google display name is often not the encyclopedia's page title.
        // Search only around the candidate and require both name and coordinates.
        url.searchParams.delete('titles');
        url.searchParams.set('generator', 'geosearch');
        url.searchParams.set('ggscoord', `${candidate.latitude}|${candidate.longitude}`);
        url.searchParams.set('ggsradius', String(Math.min(10000, aheadDiscovery.knowledgeMatchRadiusMeters)));
        url.searchParams.set('ggslimit', '10');
        const nearby = await fetch(url, { signal: AbortSignal.timeout(aheadDiscovery.knowledgeTimeoutMs), headers: { 'User-Agent': 'HeyCity/0.1 (https://heycity.stolbergco.com)' } });
        if (!nearby.ok) throw new Error('knowledge_unavailable');
        const nearbyData = await nearby.json() as typeof data;
        const words = (name: string) => new Set(name.toLowerCase().replace(/\bst[.]?\b/g, 'saint').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'of'].includes(w)));
        const wanted = words(candidate.name.split(',')[0]);
        for (const page of Object.values(nearbyData.query?.pages ?? {})) {
          const coord = page.coordinates?.[0]; const titleWords = words(page.title ?? '');
          const match = [...wanted].filter(w => titleWords.has(w)).length / Math.max(wanted.size, titleWords.size, 1);
          if (!coord || !page.pageid || page.pageprops?.disambiguation !== undefined || !page.extract || page.extract.length < aheadDiscovery.knowledgeMinChars || match < 0.6) continue;
          if (distanceMeters(candidate.latitude, candidate.longitude, coord.lat, coord.lon) > aheadDiscovery.knowledgeMatchRadiusMeters) continue;
          seed = normalizeEvidence({ id: candidate.providerId, name: candidate.name, category: candidate.targetType }, page.extract.slice(0, aheadDiscovery.knowledgeMaxChars), 'wikipedia', `https://en.wikipedia.org/?curid=${page.pageid}`);
          break;
        }
      }
      await recordUsage({ category: 'product', operation: seed ? 'knowledge_matched' : 'knowledge_no_match' });
      await cacheSet(key, { seed }, aheadDiscovery.knowledgeCacheSeconds);
    } catch {
      await recordUsage({ category: 'product', operation: 'knowledge_provider_error' });
      await cacheSet(key, { seed: null }, aheadDiscovery.providerErrorBackoffSeconds);
    }
    return seed;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

/** Legacy callers only; generation consumes discoveryEvidence directly. */
export async function discoveryStorySeed(candidate: DiscoveryCandidate): Promise<string | null> {
  const evidence = await discoveryEvidence(candidate);
  return evidence ? evidence.items.map(item => item.claim).join(' ') : null;
}
