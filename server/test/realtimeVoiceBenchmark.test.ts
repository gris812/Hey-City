import assert from 'node:assert/strict';
import {
  REALTIME_BENCHMARK_SCRIPTS,
  runRealtimeBenchmark,
  type RealtimeBenchmarkDriver,
  type RealtimeBenchmarkEnvironment,
  type RealtimeBenchmarkObservation,
  type RealtimeBenchmarkProviderId,
  type RealtimeBenchmarkScript,
} from '../src/benchmark/realtimeVoiceBenchmark';

const environment: RealtimeBenchmarkEnvironment = {
  recordedAt: '2026-09-27T12:00:00.000Z',
  mode: 'deterministic',
  platform: 'test',
  transport: 'deterministic',
  network: 'fixture',
  guide: 'dana',
  language: 'en',
  inactivityTimeoutMs: 30_000,
};

function driver(provider: RealtimeBenchmarkProviderId, model: string, offset: number): RealtimeBenchmarkDriver {
  return {
    provider,
    model,
    run: async (script: RealtimeBenchmarkScript): Promise<RealtimeBenchmarkObservation> => ({
      provider,
      model,
      scriptId: script.id,
      connectMs: 100 + offset,
      localPauseMs: script.id === 'B1' ? 4 : undefined,
      finalTurnMs: 200 + offset,
      firstAudioMs: 300 + offset,
      bargeInStopMs: script.id === 'B3' ? 25 + offset : undefined,
      totalTurnMs: 400 + offset,
      toolCorrect: true,
      transcriptCorrect: true,
      factualPreservation: provider === 'gemini_live' && script.id === 'B5' ? 'not_inspectable' : 'preserved',
      reconnectSucceeded: script.id === 'B6' ? true : undefined,
      staleAudioObserved: false,
      inputAudioUnits: 10,
      outputAudioUnits: 20,
      estimatedCostUsd: 0.001,
      errors: [],
    }),
  };
}

async function run(): Promise<void> {
  assert.deepEqual(REALTIME_BENCHMARK_SCRIPTS.map(script => script.id), ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
  assert.deepEqual(REALTIME_BENCHMARK_SCRIPTS.find(script => script.id === 'B3')?.utterances,
    ['Where can I get coffee nearby?', 'No, I meant parking.']);

  const report = await runRealtimeBenchmark([
    driver('openai_realtime', 'openai-fixture', 0),
    driver('gemini_live', 'gemini-fixture', 10),
  ], environment);

  assert.equal(report.comparable, true);
  assert.equal(report.observations.length, 12);
  assert.deepEqual(report.scripts, ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
  assert.deepEqual(report.observations.map(row => `${row.scriptId}:${row.provider}`), [
    'B1:openai_realtime', 'B1:gemini_live',
    'B2:openai_realtime', 'B2:gemini_live',
    'B3:openai_realtime', 'B3:gemini_live',
    'B4:openai_realtime', 'B4:gemini_live',
    'B5:openai_realtime', 'B5:gemini_live',
    'B6:openai_realtime', 'B6:gemini_live',
  ]);
  const openai = report.summaries.find(summary => summary.provider === 'openai_realtime');
  assert.equal(openai?.connectP50Ms, 100);
  assert.equal(openai?.toolReliability, 1);
  assert.equal(openai?.factualPreservation, 1);
  assert.equal(openai?.reconnectSuccess, 1);
  assert.equal(openai?.estimatedCostUsd, 0.006);

  await assert.rejects(
    () => runRealtimeBenchmark([driver('openai_realtime', 'only-one', 0)], environment),
    /at least two provider drivers/,
  );
  console.log('realtime voice benchmark B1-B6 contract passed');
}

void run().catch(error => { console.error(error); process.exitCode = 1; });

