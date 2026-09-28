export type RealtimeBenchmarkScriptId = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';
export type RealtimeBenchmarkProviderId = 'openai_realtime' | 'gemini_live';
export type RealtimeBenchmarkMode = 'deterministic' | 'lab-live' | 'field-live';

export interface RealtimeBenchmarkScript {
  id: RealtimeBenchmarkScriptId;
  name: string;
  utterances: readonly string[];
  requiredChecks: readonly string[];
}

/**
 * Canonical B1-B6 inputs. Drivers may translate transport envelopes, but must
 * not change these utterances or checks between providers in a comparison.
 */
export const REALTIME_BENCHMARK_SCRIPTS: readonly RealtimeBenchmarkScript[] = [
  {
    id: 'B1',
    name: 'Coffee interruption',
    utterances: ['Where can I get coffee nearby?'],
    requiredChecks: ['local_pause', 'nearby_search', 'validated_map_action', 'grounded_answer', 'same_moment_resume'],
  },
  {
    id: 'B2',
    name: 'Contextual follow-up',
    utterances: ['Why is that important?'],
    requiredChecks: ['active_subject', 'story_evidence', 'no_places_call', 'factual_preservation'],
  },
  {
    id: 'B3',
    name: 'Barge-in',
    utterances: ['Where can I get coffee nearby?', 'No, I meant parking.'],
    requiredChecks: ['old_output_stopped', 'no_stale_chunks', 'latest_turn_wins', 'parking_search'],
  },
  {
    id: 'B4',
    name: 'Road noise',
    utterances: ['Where can I get coffee nearby?'],
    requiredChecks: ['controlled_noise_fixture', 'intended_turn', 'false_start_count', 'missed_turn_count'],
  },
  {
    id: 'B5',
    name: 'Dana / Artur',
    utterances: ['Federal Hall hosted the first United States Congress.'],
    requiredChecks: ['same_approved_content', 'dana', 'artur', 'russian', 'english'],
  },
  {
    id: 'B6',
    name: 'Session lifecycle',
    utterances: ['Why is that important?', 'Tell me more.', 'Continue.'],
    requiredChecks: ['connection_reuse', 'inactivity_close', 'no_usage_after_close', 'clean_reopen'],
  },
] as const;

export interface RealtimeBenchmarkEnvironment {
  recordedAt: string;
  mode: RealtimeBenchmarkMode;
  platform: string;
  transport: string;
  network: string;
  region?: string;
  guide: 'dana' | 'artur';
  language: string;
  inactivityTimeoutMs: number;
}

export interface RealtimeBenchmarkObservation {
  provider: RealtimeBenchmarkProviderId;
  model: string;
  scriptId: RealtimeBenchmarkScriptId;
  connectMs?: number;
  localPauseMs?: number;
  finalTurnMs?: number;
  firstAudioMs?: number;
  bargeInStopMs?: number;
  totalTurnMs?: number;
  toolCorrect: boolean;
  transcriptCorrect: boolean;
  factualPreservation: 'preserved' | 'drift' | 'not_inspectable';
  personaScore?: number;
  falseStarts?: number;
  missedTurns?: number;
  reconnectSucceeded?: boolean;
  staleAudioObserved?: boolean;
  inputAudioUnits: number;
  outputAudioUnits: number;
  estimatedCostUsd: number;
  errors: readonly string[];
}

export interface RealtimeBenchmarkDriver {
  readonly provider: RealtimeBenchmarkProviderId;
  readonly model: string;
  run(script: RealtimeBenchmarkScript, environment: RealtimeBenchmarkEnvironment): Promise<RealtimeBenchmarkObservation>;
}

export interface RealtimeBenchmarkProviderSummary {
  provider: RealtimeBenchmarkProviderId;
  model: string;
  connectP50Ms?: number;
  connectP95Ms?: number;
  finalTurnP50Ms?: number;
  finalTurnP95Ms?: number;
  firstAudioP50Ms?: number;
  firstAudioP95Ms?: number;
  bargeInStopP50Ms?: number;
  bargeInStopP95Ms?: number;
  toolReliability: number;
  transcriptCorrectness: number;
  factualPreservation: number | 'not_inspectable';
  reconnectSuccess: number;
  estimatedCostUsd: number;
}

export interface RealtimeBenchmarkReport {
  environment: RealtimeBenchmarkEnvironment;
  scripts: readonly RealtimeBenchmarkScriptId[];
  observations: readonly RealtimeBenchmarkObservation[];
  summaries: readonly RealtimeBenchmarkProviderSummary[];
  comparable: boolean;
  comparisonWarnings: readonly string[];
}

export async function runRealtimeBenchmark(
  drivers: readonly RealtimeBenchmarkDriver[],
  environment: RealtimeBenchmarkEnvironment,
): Promise<RealtimeBenchmarkReport> {
  if (drivers.length < 2) throw new Error('Realtime benchmark requires at least two provider drivers');
  const observations: RealtimeBenchmarkObservation[] = [];
  for (const script of REALTIME_BENCHMARK_SCRIPTS) {
    for (const driver of drivers) {
      const observation = await driver.run(script, environment);
      if (observation.provider !== driver.provider || observation.model !== driver.model || observation.scriptId !== script.id) {
        throw new Error(`Benchmark driver returned mismatched identity for ${driver.provider}/${script.id}`);
      }
      observations.push(observation);
    }
  }
  const comparisonWarnings = validateComparison(drivers, observations);
  return {
    environment,
    scripts: REALTIME_BENCHMARK_SCRIPTS.map(script => script.id),
    observations,
    summaries: drivers.map(driver => summarize(driver, observations)),
    comparable: comparisonWarnings.length === 0,
    comparisonWarnings,
  };
}

function validateComparison(
  drivers: readonly RealtimeBenchmarkDriver[],
  observations: readonly RealtimeBenchmarkObservation[],
): string[] {
  const warnings: string[] = [];
  const uniqueProviders = new Set(drivers.map(driver => driver.provider));
  if (uniqueProviders.size !== drivers.length) warnings.push('duplicate_provider_driver');
  for (const driver of drivers) {
    const ids = new Set(observations.filter(item => item.provider === driver.provider).map(item => item.scriptId));
    for (const script of REALTIME_BENCHMARK_SCRIPTS) {
      if (!ids.has(script.id)) warnings.push(`${driver.provider}:missing_${script.id}`);
    }
  }
  return warnings;
}

function summarize(
  driver: RealtimeBenchmarkDriver,
  all: readonly RealtimeBenchmarkObservation[],
): RealtimeBenchmarkProviderSummary {
  const rows = all.filter(item => item.provider === driver.provider && item.model === driver.model);
  const factual = rows.filter(row => row.factualPreservation !== 'not_inspectable');
  const reconnect = rows.filter(row => row.reconnectSucceeded !== undefined);
  return {
    provider: driver.provider,
    model: driver.model,
    connectP50Ms: percentile(rows.map(row => row.connectMs), 0.5),
    connectP95Ms: percentile(rows.map(row => row.connectMs), 0.95),
    finalTurnP50Ms: percentile(rows.map(row => row.finalTurnMs), 0.5),
    finalTurnP95Ms: percentile(rows.map(row => row.finalTurnMs), 0.95),
    firstAudioP50Ms: percentile(rows.map(row => row.firstAudioMs), 0.5),
    firstAudioP95Ms: percentile(rows.map(row => row.firstAudioMs), 0.95),
    bargeInStopP50Ms: percentile(rows.map(row => row.bargeInStopMs), 0.5),
    bargeInStopP95Ms: percentile(rows.map(row => row.bargeInStopMs), 0.95),
    toolReliability: ratio(rows.filter(row => row.toolCorrect).length, rows.length),
    transcriptCorrectness: ratio(rows.filter(row => row.transcriptCorrect).length, rows.length),
    factualPreservation: factual.length === 0
      ? 'not_inspectable'
      : ratio(factual.filter(row => row.factualPreservation === 'preserved').length, factual.length),
    reconnectSuccess: ratio(reconnect.filter(row => row.reconnectSucceeded).length, reconnect.length),
    estimatedCostUsd: round(rows.reduce((sum, row) => sum + row.estimatedCostUsd, 0), 6),
  };
}

function percentile(values: readonly (number | undefined)[], quantile: number): number | undefined {
  const sorted = values.filter((value): value is number => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const index = Math.ceil(quantile * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function ratio(value: number, total: number): number {
  return total === 0 ? 0 : round(value / total, 4);
}

function round(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

