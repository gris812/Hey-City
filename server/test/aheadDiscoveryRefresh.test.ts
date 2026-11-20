import assert from 'node:assert/strict';
import { getAheadDiscoveryConfig } from '../src/config';
import { evaluateAheadDiscovery } from '../src/services/aheadDiscovery';
import type { DiscoveryDataProvider, SearchAheadInput } from '../src/services/aheadDiscoveryTypes';
import type { MovementContext } from '@heycity/shared';

const movement: MovementContext = {
  latitude: 39.7817,
  longitude: -89.6501,
  headingDegrees: 0,
  speedMps: 22,
  accuracyMeters: 10,
  timestamp: '2026-07-25T12:00:00.000Z',
};

function createProvider(delayMs = 0): DiscoveryDataProvider & { calls: number } {
  return {
    name: 'google',
    calls: 0,
    async searchAhead(_input: SearchAheadInput) {
      this.calls += 1;
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return [
        {
          providerId: 'springfield',
          provider: 'google',
          name: 'Springfield, Illinois',
          targetType: 'city',
          latitude: 39.9,
          longitude: -89.65,
          providerTypes: ['locality'],
        },
      ];
    },
  };
}

function createEmptyProvider(): DiscoveryDataProvider & { calls: number } {
  return {
    name: 'google',
    calls: 0,
    async searchAhead() {
      this.calls += 1;
      return [];
    },
  };
}

function createFailingProvider(): DiscoveryDataProvider & { calls: number } {
  return {
    name: 'google',
    calls: 0,
    async searchAhead() {
      this.calls += 1;
      throw new Error('provider_unavailable');
    },
  };
}

async function run() {
  const provider = createProvider();
  const first = await evaluateAheadDiscovery({
    sessionId: 'refresh-a',
    movement,
    provider,
    nowMs: Date.parse(movement.timestamp),
  });
  assert.equal(provider.calls, 1, 'provider refresh occurs when due');
  assert.equal(first.decision.type, 'target_selected');
  assert.equal(first.providerRefresh.configuredIntervalMinutes, 60, '60-minute default loads from config');

  await evaluateAheadDiscovery({
    sessionId: 'refresh-a',
    movement: { ...movement, timestamp: '2026-07-25T12:00:20.000Z' },
    provider,
    nowMs: Date.parse('2026-07-25T12:00:20.000Z'),
  });
  assert.equal(provider.calls, 1, 'provider refresh does not occur on every GPS evaluation');

  await evaluateAheadDiscovery({
    sessionId: 'refresh-a',
    movement: { ...movement, timestamp: '2026-07-25T12:00:40.000Z' },
    provider,
    forceRefresh: true,
    nowMs: Date.parse('2026-07-25T12:00:40.000Z'),
  });
  assert.equal(provider.calls, 2, 'manual refresh forces provider call');

  const cityRoute = {
    ...createProvider(),
    async searchAhead() {
      this.calls += 1;
      return [
        { providerId: 'sioux-city', provider: 'google' as const, name: 'Sioux City', targetType: 'city' as const,
          latitude: 42.5, longitude: -96.4, providerTypes: ['locality'] },
        { providerId: 'sioux-falls', provider: 'google' as const, name: 'Sioux Falls', targetType: 'city' as const,
          latitude: 43.55, longitude: -96.73, providerTypes: ['locality'] },
        { providerId: 'park', provider: 'google' as const, name: 'Nearby Park', targetType: 'park' as const,
          latitude: 43.526, longitude: -96.73, providerTypes: ['park'] },
      ];
    },
  };
  for (const [index, [latitude, longitude, expected]] of [
    [42.49, -96.4, 'sioux-city'], [43.54, -96.73, 'sioux-falls'],
  ].entries()) {
    const nowMs = Date.parse(movement.timestamp) + index * 60000;
    const result = await evaluateAheadDiscovery({ sessionId: 'city-route', provider: cityRoute, nowMs,
      movement: { ...movement, latitude: Number(latitude), longitude: Number(longitude), timestamp: new Date(nowMs).toISOString() } });
    assert.equal(result.decision.type === 'target_selected' && result.decision.target.providerId, expected);
    if (index) assert(result.nearbyCandidates?.some(candidate => candidate.providerId === 'park' && !candidate.isAhead));
  }
  assert.equal(cityRoute.calls, 1, 'cached candidates are re-evaluated with current movement');
  const emptyProvider = createEmptyProvider();
  await evaluateAheadDiscovery({
    sessionId: 'refresh-empty',
    movement,
    provider: emptyProvider,
    nowMs: Date.parse(movement.timestamp),
  });
  await evaluateAheadDiscovery({
    sessionId: 'refresh-empty',
    movement: { ...movement, timestamp: '2026-07-25T12:00:20.000Z' },
    provider: emptyProvider,
    nowMs: Date.parse('2026-07-25T12:00:20.000Z'),
  });
  assert.equal(emptyProvider.calls, 1, 'empty results do not create a paid refresh loop');

  const failingProvider = createFailingProvider();
  await evaluateAheadDiscovery({
    sessionId: 'refresh-failure',
    movement,
    provider: failingProvider,
    nowMs: Date.parse(movement.timestamp),
  });
  await evaluateAheadDiscovery({
    sessionId: 'refresh-failure',
    movement: { ...movement, timestamp: '2026-07-25T12:00:20.000Z' },
    provider: failingProvider,
    nowMs: Date.parse('2026-07-25T12:00:20.000Z'),
  });
  assert.equal(failingProvider.calls, 1, 'provider failures respect the configured retry interval');

  const slowProvider = createProvider(40);
  const firstRefresh = evaluateAheadDiscovery({
    sessionId: 'refresh-concurrent',
    movement,
    provider: slowProvider,
    forceRefresh: true,
    nowMs: Date.parse(movement.timestamp),
  });
  const secondRefresh = await evaluateAheadDiscovery({
    sessionId: 'refresh-concurrent',
    movement,
    provider: slowProvider,
    forceRefresh: true,
    nowMs: Date.parse(movement.timestamp),
  });
  await firstRefresh;
  assert.equal(secondRefresh.decision.type, 'hold', 'concurrent manual refresh is rejected or coalesced');
  assert.equal(
    secondRefresh.decision.type === 'hold' ? secondRefresh.decision.reason : '',
    'refresh_in_progress'
  );

  const movingProvider = createProvider();
  await evaluateAheadDiscovery({ sessionId: 'moving-refresh', movement, provider: movingProvider, nowMs: Date.parse(movement.timestamp) });
  const relocated = { ...movement, latitude: movement.latitude + 0.1, timestamp: '2026-07-25T12:01:00.000Z' };
  await evaluateAheadDiscovery({ sessionId: 'moving-refresh', movement: relocated, provider: movingProvider, nowMs: Date.parse(relocated.timestamp) });
  assert.equal(movingProvider.calls, 1, 'moving respects minimum paid-call interval');
  relocated.timestamp = '2026-07-25T12:04:00.000Z';
  await evaluateAheadDiscovery({ sessionId: 'moving-refresh', movement: relocated, provider: movingProvider, nowMs: Date.parse(relocated.timestamp) });
  assert.equal(movingProvider.calls, 2, 'leaving search area refreshes before an hour passes');

  assert.throws(
    () => getAheadDiscoveryConfig({ AHEAD_DISCOVERY_PROVIDER_REFRESH_MINUTES: '5' }),
    /between 15 and 240/,
    'invalid refresh config fails validation'
  );
}

run().then(() => console.log('aheadDiscoveryRefresh tests passed'));
