import type { EvidenceItem } from '../services/evidence';

const cityCategories = new Set(['city', 'town', 'locality', 'district', 'region']);
export const isCityNarrativeCategory = (category: string) => cityCategories.has(category);
const largeCategories = new Set(['historical_landmark', 'cultural_landmark', 'national_park', 'state_park', 'university', 'museum']);
const dimensions = [
  ['geography', /\b(river|valley|border|geograph\w*|landscape|harbou?r|mountain|coast|lake|confluence)\b/i],
  ['history', /\b(founded|settlement|settled|incorporated|century|war|historic|expedition|treaty|coloniz\w*|era)\b/i],
  ['economy', /\b(industry|railway|railroad|trade|manufactur\w*|stockyards?|agricultur\w*|factory|port|market)\b/i],
  ['culture', /\b(cultur\w*|art|music|festival|architectur\w*|theat(?:er|re)|tradition|community)\b/i],
  ['people', /\b(leader|named (?:for|after)|artist|founder|explorer|tribe|indigenous|immigr\w*|inhabited)\b/i],
  ['places', /\b(museum|park|monument|memorial|trail|centre|center|site|garden|gallery)\b/i],
] as const;

export function selectNarrativeDepth(category: string, items: EvidenceItem[]) {
  const scale: 'city' | 'landmark' | undefined = isCityNarrativeCategory(category) ? 'city' : largeCategories.has(category) ? 'landmark' : undefined;
  if (!scale) return undefined;

  // Pick independent claims for distinct dimensions before spending the remaining evidence budget.
  const overviewItems = scale === 'city' ? items.filter(item => !/\b(?:population|census|most populous|residents)\b/i.test(item.claim)) : items;
  const anchors: EvidenceItem[] = [];
  const themes = dimensions.flatMap(([theme, pattern]) => {
    const match = overviewItems.find(item => !anchors.includes(item) && pattern.test(item.claim));
    if (!match) return [];
    anchors.push(match);
    return [theme];
  });
  if (scale === 'city' && overviewItems.length >= 6 && anchors.length >= 3) {
    return { scale, themes, targetDurationSec: overviewItems.length >= 10 && anchors.length >= 4 ? 180 : overviewItems.length >= 8 ? 150 : 120,
      items: [...anchors, ...overviewItems.filter(item => !anchors.includes(item))].slice(0, 12) };
  }
  if (scale === 'landmark' && items.length >= 4 && anchors.length >= 2) {
    return { scale, themes, targetDurationSec: items.length >= 8 ? 120 : items.length >= 6 ? 90 : 60,
      items: [...anchors, ...items.filter(item => !anchors.includes(item))].slice(0, 8) };
  }
  return undefined;
}
