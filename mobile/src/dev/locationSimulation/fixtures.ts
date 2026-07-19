import type { LocationEvent } from '../../location/types';

export type LocationSimulationFixture = {
  id: 'fidi-walking-demo';
  name: 'FiDi Walking Demo';
  intervalMs: number;
  events: LocationEvent[];
};

const startTimestampMs = 1_700_000_000_000;

export const fidiWalkingDemo: LocationSimulationFixture = {
  id: 'fidi-walking-demo',
  name: 'FiDi Walking Demo',
  intervalMs: 1000,
  events: [
    { latitude: 40.707491, longitude: -74.011276, heading: 86, speedKmh: 4.6, timestampMs: startTimestampMs },
    { latitude: 40.707503, longitude: -74.010921, heading: 88, speedKmh: 4.7, timestampMs: startTimestampMs + 1000 },
    { latitude: 40.707511, longitude: -74.010542, heading: 89, speedKmh: 4.8, timestampMs: startTimestampMs + 2000 },
    { latitude: 40.707515, longitude: -74.010158, heading: 91, speedKmh: 4.6, timestampMs: startTimestampMs + 3000 },
    { latitude: 40.707518, longitude: -74.009779, heading: 91, speedKmh: 0, timestampMs: startTimestampMs + 4000 },
    { latitude: 40.707518, longitude: -74.009779, heading: 91, speedKmh: 0, timestampMs: startTimestampMs + 5000 },
    { latitude: 40.707546, longitude: -74.009402, heading: 84, speedKmh: 4.2, timestampMs: startTimestampMs + 6000 },
    { latitude: 40.707591, longitude: -74.009021, heading: 79, speedKmh: 4.5, timestampMs: startTimestampMs + 7000 },
    { latitude: 40.707651, longitude: -74.008664, heading: 73, speedKmh: 4.4, timestampMs: startTimestampMs + 8000 },
  ],
};

export const locationSimulationFixtures = [fidiWalkingDemo] as const;
