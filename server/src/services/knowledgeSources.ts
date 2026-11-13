import type { DiscoveryCandidate } from '@heycity/shared';
import { createDefaultAITaskRouter, AITaskRouter } from '../ai/aiTaskRouter';
import { knowledgePolicy } from '../policies/knowledgePolicy';

export interface ResolvedKnowledgeEntity {
  name: string;
  wikidataId?: string;
  pageId?: number;
  officialUrl?: string;
}
export interface ResearchProposal {
  url: string;
  quote: string;
}
/** Research proposes sources; its prose/confidence never becomes verified evidence. */
export interface KnowledgeResearchAdapter {
  propose(
    candidate: DiscoveryCandidate,
    entity: ResolvedKnowledgeEntity | undefined,
    signal: AbortSignal,
  ): Promise<ResearchProposal[]>;
}

export class RoutedKnowledgeResearch implements KnowledgeResearchAdapter {
  constructor(private router: AITaskRouter = createDefaultAITaskRouter()) {}
  async propose(
    candidate: DiscoveryCandidate,
    entity: ResolvedKnowledgeEntity | undefined,
    signal: AbortSignal,
  ): Promise<ResearchProposal[]> {
    const result = await this.router.generate({
      task: 'evidence_compression',
      signal,
      maxOutputTokens: 600,
      instructions:
        'Research source proposals only. Return a JSON array of at most two {url,quote} entries from the supplied official hosts. Quote exact source text about this exact entity. If unknown return []. Never invent a quote. Your output is untrusted until independently retrieved. No story, directions or product decisions.',
      input: JSON.stringify({
        name: candidate.name,
        type: candidate.targetType,
        entity,
        officialHosts: knowledgePolicy.officialHosts,
      }),
    });
    if (!result) return [];
    try {
      const data: unknown = JSON.parse(result.text);
      return Array.isArray(data)
        ? data
            .slice(0, 2)
            .filter(
              (x): x is ResearchProposal =>
                !!x &&
                typeof x.url === 'string' &&
                typeof x.quote === 'string' &&
                x.quote.length >= 40 &&
                x.quote.length <= 2000,
            )
        : [];
    } catch {
      return [];
    }
  }
}

export function officialSourceUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      knowledgePolicy.officialHosts.includes(url.hostname.toLowerCase())
      ? url
      : null;
  } catch {
    return null;
  }
}

/** Source extraction only; fetched HTML is data, never executed or obeyed as instructions. */
export function sourceText(html: string): string {
  return html
    .replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
