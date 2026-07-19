import * as Location from 'expo-location';
import type { LocationEvent, LocationSource } from './types';

export function normalizeExpoLocation(location: Location.LocationObject): LocationEvent {
  const heading =
    typeof location.coords.heading === 'number' && location.coords.heading >= 0
      ? location.coords.heading
      : 0;
  const speedKmh =
    typeof location.coords.speed === 'number' && location.coords.speed > 0
      ? location.coords.speed * 3.6
      : 0;

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    heading,
    speedKmh,
    timestampMs: location.timestamp,
    accuracyMeters:
      typeof location.coords.accuracy === 'number' ? location.coords.accuracy : undefined,
  };
}

export class RealLocationSource implements LocationSource {
  private subscription: Location.LocationSubscription | null = null;

  async start(onLocation: (event: LocationEvent) => void): Promise<void> {
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    onLocation(normalizeExpoLocation(current));

    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 3000,
        distanceInterval: 5,
      },
      (location) => onLocation(normalizeExpoLocation(location))
    );
  }

  async stop(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
  }
}
