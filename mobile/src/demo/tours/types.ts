import type { ImageSourcePropType } from 'react-native';
import type { GuidePreference, SupportedLocale } from '../../localization/preferences';
import type { JourneyState } from '../guidedTour/modes';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type GuideId = GuidePreference;

export type DemoNarrative = {
  title: string;
  approachText?: string;
  arrivalText: string;
  followUpPrompt?: string;
  estimatedDurationSec: number;
};

export type DemoFact = {
  text: string;
  sourceReference: string;
  verifiedAt: string;
};

export type TargetMedia = {
  imageSource?: ImageSourcePropType;
  imageAlt?: string;
  attribution?: string;
};

export type DemoTarget = {
  id: string;
  sequence: number;
  name: string;
  aliases?: string[];
  coordinates: Coordinate;
  targetType:
    | 'building'
    | 'monument'
    | 'street'
    | 'district'
    | 'park'
    | 'viewpoint'
    | 'waterfront';
  categoryTags: string[];
  triggerRadii: {
    discoveryMeters: number;
    approachMeters: number;
    arrivalMeters: number;
  };
  narratives: Record<GuideId, Record<SupportedLocale, DemoNarrative>>;
  facts: DemoFact[];
  media?: {
    imageAsset?: string;
    attribution?: string;
    license?: string;
    altText: Record<SupportedLocale, string>;
  };
  route: {
    nextTargetId?: string;
    routeCoordinates: Coordinate[];
    estimatedWalkSeconds: number;
  };
  presentation: {
    mapCenter: Coordinate;
    zoom?: number;
    heading?: number;
    pitch?: number;
    mediaMode: 'none' | 'photo';
  };
  expectedDemoEvents?: JourneyState[];
};

export type DemoTour = {
  id: string;
  title: Record<SupportedLocale, string>;
  description: Record<SupportedLocale, string>;
  targetIds: string[];
  startCoordinate: Coordinate;
  endCoordinate: Coordinate;
  fullRouteCoordinates: Coordinate[];
  continueDelaySec: number;
  completionNarratives: Record<GuideId, Record<SupportedLocale, string>>;
};

export type DemoTourMetadata = {
  id: string;
  title: Record<SupportedLocale, string>;
  targets: string[];
};
