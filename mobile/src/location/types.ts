export type LocationEvent = {
  latitude: number;
  longitude: number;
  heading: number;
  speedKmh: number;
  timestampMs: number;
  accuracyMeters?: number;
};

export interface LocationSource {
  start(onLocation: (event: LocationEvent) => void): Promise<void>;
  stop(): Promise<void>;
}

export type LocationPermissionResult = 'granted' | 'denied' | 'restricted';

export type FirstAreaIntroductionContext = {
  latitude: number;
  longitude: number;
  guideId: 'dana' | 'arthur';
  guideLanguage: 'en' | 'ru';
};
