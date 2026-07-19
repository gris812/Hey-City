import { fidiWalkingDemo } from '../src/dev/locationSimulation/fixtures';
import { SimulatedLocationSource } from '../src/dev/locationSimulation/SimulatedLocationSource';
import type { LocationEvent } from '../src/location/types';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collect(source: SimulatedLocationSource, waitMs: number): Promise<LocationEvent[]> {
  const events: LocationEvent[] = [];
  await source.start((event) => events.push(event));
  await wait(waitMs);
  await source.stop();
  return events;
}

(async () => {
  const first = await collect(new SimulatedLocationSource(fidiWalkingDemo, { playbackSpeed: 50 }), 30);
  const second = await collect(new SimulatedLocationSource(fidiWalkingDemo, { playbackSpeed: 50 }), 30);
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'fixture emits identical events each run');

  for (let i = 0; i < fidiWalkingDemo.events.length; i += 1) {
    const event = fidiWalkingDemo.events[i];
    assert(event.heading >= 0 && event.heading <= 360, 'heading is valid');
    assert(event.speedKmh >= 0, 'speed is non-negative');
    if (i > 0) {
      assert(
        event.timestampMs >= fidiWalkingDemo.events[i - 1].timestampMs,
        'timestamps are monotonic'
      );
    }
    assert('latitude' in event && 'longitude' in event, 'normalized event has coordinates');
    assert(!('target' in event) && !('story' in event), 'simulator does not choose targets or stories');
  }

  const source = new SimulatedLocationSource(fidiWalkingDemo, { playbackSpeed: 50 });
  const events: LocationEvent[] = [];
  await source.start((event) => events.push(event));
  source.pause();
  const pausedCount = events.length;
  await wait(30);
  assertEqual(events.length, pausedCount, 'pause stops event emission');
  source.resume();
  await wait(30);
  assert(events.length > pausedCount, 'resume continues event emission');
  await source.stop();
  const stoppedCount = events.length;
  await wait(30);
  assertEqual(events.length, stoppedCount, 'stop prevents further events');

  console.log('locationSimulation tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
