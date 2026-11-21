import type { DiscoveryCandidate } from '@heycity/shared';
import { normalizeEvidence } from './evidence';
import { distanceMeters } from './geo';

const reviewedPlaces = [
  {
    names: ['Buffy the Cow'],
    latitude: 43.662268,
    longitude: -92.989917,
    radiusMeters: 500,
    category: 'cultural_landmark',
    source: 'Austin Convention and Visitors Bureau',
    url: 'https://austinmn.com/wp-content/uploads/2020/10/Austin-CVB-Statues-4-002.pdf',
    facts: [
      'The fiberglass Guernsey cow is about 20 feet long and 15 feet tall.',
      'The statue was a landmark at a local family business from 1965 before moving to the Mower County Fairgrounds in 2011.',
      'A contest to name the cow in 1966 attracted more than five thousand entries.',
    ],
  },
  {
    names: ['Walnut Lake Wildlife Management Area', 'Walnut Lake State Wildlife Management Area', 'Walnut Lake WMA'],
    latitude: 43.65551,
    longitude: -93.776615,
    radiusMeters: 3500,
    category: 'natural_feature',
    source: 'FilledTag, based on Minnesota DNR WMA data',
    url: 'https://www.filledtag.com/minnesota/wma/walnut-lake-wma/',
    facts: [
      'The Minnesota Department of Natural Resources manages the wildlife area in Faribault County near Wells.',
      'The wildlife area covers roughly 2,900 acres across three separate parcels.',
      'The DNR data for the area lists wildlife including pheasants, ducks and geese.',
    ],
  },
] as const;

export function reviewedPlaceEvidence(candidate: DiscoveryCandidate) {
  const name = candidate.name.trim().toLowerCase();
  const entry = reviewedPlaces.find(place => place.names.some(alias => alias.toLowerCase() === name) &&
    distanceMeters(candidate.latitude, candidate.longitude, place.latitude, place.longitude) <= place.radiusMeters);
  if (!entry) return undefined;
  return normalizeEvidence({ id: candidate.providerId, name: candidate.name, category: entry.category },
    entry.facts.join(' '), entry.source, entry.url);
}
