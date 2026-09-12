import type { DiscoveryCandidate } from '@heycity/shared';
import { aheadDiscovery } from '../config';
import { cacheGet, cacheSet } from './cache';
import { distanceMeters } from './geo';

const pending = new Map<string, Promise<string | null>>();

/** Exact-title lookup with redirects and coordinate validation; never invent a seed from a name. */
export async function discoveryStorySeed(candidate: DiscoveryCandidate): Promise<string | null> {
  const key = `discovery-knowledge:v1:${candidate.providerId}`;
  const cached = await cacheGet<{ seed: string | null }>(key);
  if (cached) return cached.seed;
  if (pending.has(key)) return pending.get(key)!;
  const task = (async () => {
    let seed: string | null = null;
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
        seed = `Category: ${candidate.targetType}. Source: https://en.wikipedia.org/?curid=${page.pageid} (Wikipedia, CC BY-SA).\n${page.extract.slice(0, aheadDiscovery.knowledgeMaxChars)}`;
        break;
      }
      await cacheSet(key, { seed }, aheadDiscovery.knowledgeCacheSeconds);
    } catch {
      await cacheSet(key, { seed: null }, aheadDiscovery.providerErrorBackoffSeconds);
    }
    return seed;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
