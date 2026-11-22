import assert from 'node:assert/strict';
import type { DiscoveryCandidate } from '@heycity/shared';
import {
  cachedStoryEvidenceHint,
  unavailableEvidenceTtl,
  discoveryEvidence,
  retrieveDiscoveryKnowledge,
  knowledgeNameMatches,
  setKnowledgeResearchAdapter,
} from '../src/services/discoveryKnowledge';
import { storyAvailability } from '../src/services/evidence';
import { knowledgePolicy } from '../src/policies/knowledgePolicy';
import { officialSourceUrl } from '../src/services/knowledgeSources';
const candidate = (id: string, name = 'Doral'): DiscoveryCandidate => ({
  providerId: id,
  provider: 'google',
  name,
  targetType: 'city',
  latitude: 25.82,
  longitude: -80.35,
  providerTypes: ['locality'],
  distanceMeters: 3000,
  bearingDegrees: 0,
  headingDeltaDegrees: 0,
  isAhead: false,
});
const page = (
  title = 'Doral, Florida',
  extract = 'The city grew around a golf resort opened in 1962. Its name combines the first names of the resort founders. The municipality incorporated in 2003 after several decades of residential and commercial development.',
) => ({
  pageid: 1,
  title,
  extract,
  pageprops: { wikibase_item: 'Q111' },
  coordinates: [{ lat: 25.82, lon: -80.35 }],
});
async function run() {
  for (const [name, latitude, longitude] of [
    ['Buffy the Cow', 43.662268, -92.989917],
    ['Walnut Lake Wildlife Management Area', 43.65551, -93.776615],
  ] as const) {
    const place = { ...candidate('reviewed-' + name, name), latitude, longitude };
    const reviewed = await retrieveDiscoveryKnowledge(place);
    assert.equal(reviewed.attempts[0].level, 'L1');
    assert(reviewed.evidence && storyAvailability(reviewed.evidence).short);
    assert.equal(reviewed.evidence.subjectId, place.providerId);
    assert(reviewed.evidence.items.every(item => item.sourceUrl?.startsWith('https://')));
  }
  const original = global.fetch;
  let calls: URL[] = [];
  global.fetch = (async (value) => {
    const url = new URL(String(value));
    calls.push(url);
    return Response.json({
      query: {
        pages:
          url.searchParams.get('titles') === 'Doral'
            ? {
                '1': {
                  pageid: 2,
                  title: 'Doral',
                  extract: 'Doral may refer to:',
                  pageprops: { disambiguation: '' },
                },
              }
            : url.searchParams.has('pageids')
              ? { '1': page('Doral, Florida', [
                  page().extract,
                  '== History ==',
                  'A fictional fixture railway carried freight across the area for decades.',
                  '== References ==',
                  'A fabricated reference section should not be selected.',
                ].join('\n')) }
              : { '1': page() },
      },
    });
  }) as typeof fetch;
  try {
    const c = candidate('resolved-city');
    const [a, b] = await Promise.all([
      retrieveDiscoveryKnowledge(c),
      retrieveDiscoveryKnowledge(c),
    ]);
    assert.equal(
      calls.length,
      3,
      'coalesced title, text search and one expanded extract for the verified city page',
    );
    assert.deepEqual(a, b);
    assert(storyAvailability(a.evidence!).short);
    assert.equal(a.entity?.name, 'Doral, Florida');
    assert.equal((await retrieveDiscoveryKnowledge(c)).attempts[0].level, 'L1');
    assert.equal(calls.length, 3);
    assert.equal(calls[2].searchParams.get('pageids'), '1');
    assert(a.evidence?.items.some(item => item.claim.includes('fixture railway')));
    assert(!a.evidence?.items.some(item => item.claim.includes('fabricated reference section')));
    assert.equal(await discoveryEvidence(candidate('wrong-buffy', 'Buffy the Cow')), null,
      'the same name at another location never uses reviewed facts');
    assert(!knowledgeNameMatches('Doral', 'Dortmund'));
    assert(knowledgeNameMatches('Knoxville', 'Knoxville, Tennessee'));
    calls = [];
    await discoveryEvidence(candidate('qualified-city', 'Doral, Florida'));
    assert.equal(calls[0].searchParams.get('titles'), 'Doral, Florida');
    global.fetch = (async (value) => {
      const url = new URL(String(value));
      calls.push(url);
      if (url.searchParams.has('titles')) throw new Error('provider timeout');
      return Response.json({ query: { pages: { '1': page() } } });
    }) as typeof fetch;
    assert(
      storyAvailability(
        (await discoveryEvidence(candidate('timeout-recovers')))!,
      ).short,
      'later source query survives first failure',
    );
    global.fetch = (async () =>
      Response.json({
        query: {
          pages: {
            '1': {
              ...page('Doral, Florida'),
              coordinates: [{ lat: 50, lon: 10 }],
            },
          },
        },
      })) as typeof fetch;
    assert.equal(
      await discoveryEvidence(candidate('wrong-continent')),
      null,
      'name alone cannot resolve a city',
    );
    global.fetch = (async () =>
      Response.json({
        query: { pages: { '1': page('Doral, Florida', 'Doral city.') } },
      })) as typeof fetch;
    const weak = await retrieveDiscoveryKnowledge(candidate('weak'));
    assert(!weak.evidence || !storyAvailability(weak.evidence).short);
    assert(unavailableEvidenceTtl(weak) > 0, 'resolved sparse evidence has an expiring verdict');
    assert.equal(unavailableEvidenceTtl({ ...weak, checkedAt: Date.now() - 301_000 }), 0);
    const sparse = candidate('weak');
    assert.equal((await cachedStoryEvidenceHint(sparse))?.status, 'unavailable');
    assert.equal(await cachedStoryEvidenceHint(candidate('cache-only-miss')), undefined);
    global.fetch = (async () => { throw new Error('provider timeout'); }) as typeof fetch;
    const timeout = candidate('timeout-verdict');
    assert.equal(unavailableEvidenceTtl(await retrieveDiscoveryKnowledge(timeout)), 0);
    assert.equal(await cachedStoryEvidenceHint(timeout), undefined);
    global.fetch = (async () => Response.json({ query: { pages: {
      '1': page('Doral, Florida', 'Doral city.'),
      '2': { ...page('Doral, Florida', 'Doral city.'), pageid: 2 },
    } } })) as typeof fetch;
    assert.equal(unavailableEvidenceTtl(await retrieveDiscoveryKnowledge(candidate('ambiguous-verdict'))), 0);

    assert.equal(officialSourceUrl('https://127.0.0.1/private'), null);
    assert.equal(officialSourceUrl('file:///etc/passwd'), null);
    knowledgePolicy.officialHosts = ['city.example'];
    global.fetch = (async (value) => {
      const url = new URL(String(value));
      if (url.hostname === 'city.example')
        return new Response(
          '<p>Doral grew around a golf resort in the 1960s. The founders combined their names to name it.</p>',
        );
      if (url.searchParams.get('action') === 'wbsearchentities')
        return Response.json({ search: [{ id: 'Q111' }] });
      if (url.searchParams.get('action') === 'wbgetentities')
        return Response.json({
          entities: {
            Q111: {
              labels: { en: { value: 'Doral' } },
              claims: {
                P625: [
                  {
                    mainsnak: {
                      datavalue: {
                        value: { latitude: 25.82, longitude: -80.35 },
                      },
                    },
                  },
                ],
                P856: [
                  {
                    mainsnak: {
                      datavalue: { value: 'https://city.example/history' },
                    },
                  },
                ],
              },
            },
          },
        });
      return Response.json({ query: { pages: {} } });
    }) as typeof fetch;
    const official = await retrieveDiscoveryKnowledge(
      candidate('wikidata-official'),
    );
    assert(
      storyAvailability(official.evidence!).short,
      'official source can supply evidence without an encyclopedia match',
    );
    assert.equal(official.evidence?.items[0].sourceType, 'official');
    assert.equal(
      official.evidence?.items[0].sourceUrl,
      'https://city.example/history',
    );

    knowledgePolicy.researchEnabled = true;
    setKnowledgeResearchAdapter({
      propose: async () => [
        {
          url: 'https://city.example/history',
          quote: 'Doral was founded by imaginary pirates and hidden kings.',
        },
      ],
    });
    global.fetch = (async (value) => {
      const url = new URL(String(value));
      if (url.hostname === 'city.example')
        return new Response(
          'Doral official city history. A completely different passage.',
        );
      return Response.json({
        query: { pages: { '1': page('Doral, Florida', 'Doral city.') } },
      });
    }) as typeof fetch;
    const rejected = await retrieveDiscoveryKnowledge(
      candidate('invented-research'),
    );
    assert(
      !rejected.evidence?.items.some((x) => x.claim.includes('pirates')),
      'retrieved quote must match; AI prose is not evidence',
    );
    assert(!rejected.evidence || !storyAvailability(rejected.evidence).short);
    const quote =
      'Doral grew around a golf resort in the 1960s and incorporated as a municipality decades later.';
    const sourceFetch = global.fetch;
    global.fetch = (async (value, options) =>
      new URL(String(value)).hostname === 'city.example'
        ? new Response(`<p>${quote}</p>`)
        : sourceFetch(value, options)) as typeof fetch;
    setKnowledgeResearchAdapter({
      propose: async () => [{ url: 'https://city.example/history', quote }],
    });
    const researched = await retrieveDiscoveryKnowledge(
      candidate('verified-research'),
    );
    assert.equal(researched.evidence?.items[0].claim, quote);
    assert.equal(researched.evidence?.items[0].sourceType, 'official_research');
    console.log(
      'knowledge entity, fallback, cache, coalescing, geography, sparse and untrusted-source regressions passed',
    );
  } finally {
    global.fetch = original;
    knowledgePolicy.officialHosts = [];
    knowledgePolicy.researchEnabled = false;
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
