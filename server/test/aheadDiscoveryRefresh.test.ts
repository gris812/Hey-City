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

  assert.throws(
    () => getAheadDiscoveryConfig({ AHEAD_DISCOVERY_PROVIDER_REFRESH_MINUTES: '5' }),
    /between 15 and 240/,
    'invalid refresh config fails validation'
  );
}

run().then(() => console.log('aheadDiscoveryRefresh tests passed'));
