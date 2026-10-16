import type { RealtimeVoiceUsageReport } from '@heycity/shared';
import type { NativeBenchmarkProvider } from './realtimeVoiceTransportFactory';
import type { RealtimeVoiceBenchmarkEvent } from './realtimeVoice';

export type M4BenchmarkScenario = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';
export type FactualComparison =
  | 'exact'
  | 'near-verbatim'
  | 'paraphrased'
  | 'omission'
  | 'added factual claim'
  | 'unverifiable';

export interface M4HumanScore {
  naturalness: number;
  guideFit: number;
  pacing: number;
  pronunciation: number;
  overallVoiceComfort: number;
}

export interface M4BenchmarkEnvironment {
  mode: 'live_native';
  device: string;
  os: string;
  appBuild: string;
  gitSha: string;
  network: string;
  fixture: string;
}

export interface M4BenchmarkMetrics {
  localPauseLatencyMs?: number;
  connectLatencyMs?: number;
  speechEndToFinalTurnMs?: number;
  speechEndToM3AnswerMs?: number;
  speechEndToFirstAudioMs?: number;
  m3AnswerToFirstAudioMs?: number;
  bargeInStopLatencyMs?: number;
  reconnectLatencyMs?: number;
}

export interface M4BenchmarkTrial {
  trialId: string;
  scenario: M4BenchmarkScenario;
  repetition: number;
  provider: NativeBenchmarkProvider;
  model: string;
  guide: string;
  language: 'ru' | 'en';
  startedAt: string;
  completedAt?: string;
  events: RealtimeVoiceBenchmarkEvent[];
  metrics?: M4BenchmarkMetrics;
  approvedM3AnswerText?: string;
  providerOutputTranscript?: string;
  factualComparison?: FactualComparison;
  usage?: Omit<RealtimeVoiceUsageReport, 'generation'>;
  humanScore?: M4HumanScore;
  notes?: string;
}

export interface M4NativeBenchmarkArtifact {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  environment: M4BenchmarkEnvironment;
  trials: M4BenchmarkTrial[];
  privacy: {
    controlledTestDataOnly: true;
    rawAudioStored: false;
    productionTelemetryChanged: false;
  };
  cost: {
    status: 'pending_measured_provider_usage' | 'measured_usage_available';
    note: string;
  };
}

/** In-memory field recorder. It never sends transcript data through product telemetry. */
export class M4NativeBenchmarkRecorder {
  readonly artifact: M4NativeBenchmarkArtifact;
  private current?: M4BenchmarkTrial;

  constructor(environment: M4BenchmarkEnvironment, now = new Date()) {
    const createdAt = now.toISOString();
    this.artifact = {
      schemaVersion: 1,
      runId: `m4_${createdAt.replace(/\D/g, '').slice(0, 14)}`,
      createdAt,
      environment,
      trials: [],
      privacy: {
        controlledTestDataOnly: true,
        rawAudioStored: false,
        productionTelemetryChanged: false,
      },
      cost: {
        status: 'pending_measured_provider_usage',
        note: 'Cost is computed from measured provider usage after both native provider runs; missing counters remain unavailable, never zero-filled.',
      },
    };
  }

  beginTrial(input: {
    scenario: M4BenchmarkScenario;
    repetition: number;
    provider: NativeBenchmarkProvider;
    guide: string;
    language: 'ru' | 'en';
  }): M4BenchmarkTrial {
    if (this.current && !this.current.completedAt) this.finishTrial({ notes: 'superseded_by_new_trial' });
    const trial: M4BenchmarkTrial = {
      trialId: `${input.provider}_${input.scenario}_${input.repetition}_${Date.now()}`,
      ...input,
      model: 'pending_connection',
      startedAt: new Date().toISOString(),
      events: [],
    };
    this.artifact.trials.push(trial);
    this.current = trial;
    return trial;
  }

  record(event: RealtimeVoiceBenchmarkEvent): void {
    const trial = this.current;
    if (!trial || trial.completedAt) return;
    trial.events.push({ ...event });
    if (event.providerId === 'openai' || event.providerId === 'gemini') trial.provider = event.providerId;
    if (event.model) trial.model = event.model;
    if (event.name === 'm3_answer_ready' && event.text !== undefined) trial.approvedM3AnswerText = event.text;
    if (event.name === 'provider_output_transcript' && event.text !== undefined) trial.providerOutputTranscript = event.text;
    if (event.name === 'response_complete' && event.usage) {
      trial.usage = event.usage;
      this.artifact.cost.status = 'measured_usage_available';
    }
  }

  finishTrial(input: {
    factualComparison?: FactualComparison;
    humanScore?: M4HumanScore;
    notes?: string;
  } = {}): M4BenchmarkTrial | undefined {
    const trial = this.current;
    if (!trial || trial.completedAt) return trial;
    trial.completedAt = new Date().toISOString();
    trial.metrics = calculateMetrics(trial.events);
    trial.factualComparison = input.factualComparison ?? classifyFactualPreservation(
      trial.approvedM3AnswerText,
      trial.providerOutputTranscript,
    );
    if (input.humanScore) trial.humanScore = validateHumanScore(input.humanScore);
    if (input.notes) trial.notes = input.notes.slice(0, 500);
    this.current = undefined;
    return trial;
  }

  hasActiveTrial(): boolean {
    return Boolean(this.current && !this.current.completedAt);
  }
}

export function calculateMetrics(events: RealtimeVoiceBenchmarkEvent[]): M4BenchmarkMetrics {
  const at = (name: RealtimeVoiceBenchmarkEvent['name']) => events.find(event => event.name === name)?.atMonotonicMs;
  const metric = (end: RealtimeVoiceBenchmarkEvent['name'], start: RealtimeVoiceBenchmarkEvent['name']) => {
    const endAt = at(end);
    const startAt = at(start);
    return endAt === undefined || startAt === undefined ? undefined : Math.max(0, Math.round(endAt - startAt));
  };
  return compactMetrics({
    localPauseLatencyMs: metric('local_story_paused', 'talk_tap'),
    connectLatencyMs: metric('realtime_ready', 'realtime_connect_start'),
    speechEndToFinalTurnMs: metric('final_turn_received', 'speech_end'),
    speechEndToM3AnswerMs: metric('m3_answer_ready', 'speech_end'),
    speechEndToFirstAudioMs: metric('first_audio', 'speech_end'),
    m3AnswerToFirstAudioMs: metric('first_audio', 'm3_answer_ready'),
    bargeInStopLatencyMs: metric('old_output_stopped', 'barge_in_detected'),
    reconnectLatencyMs: metric('reconnect_ready', 'realtime_connect_start'),
  });
}

export function benchmarkMarkdown(artifact: M4NativeBenchmarkArtifact): string {
  const rows = artifact.trials.map(trial => {
    const metrics = trial.metrics ?? {};
    return `| ${trial.provider} | ${trial.scenario} | ${trial.repetition} | ${trial.model} | ${format(metrics.speechEndToFirstAudioMs)} | ${format(metrics.bargeInStopLatencyMs)} | ${trial.factualComparison ?? 'pending'} |`;
  });
  return [
    '# M4 live/native benchmark',
    '',
    `Run: \`${artifact.runId}\`  `,
    `Device: ${artifact.environment.device} · ${artifact.environment.os}  `,
    `Build: ${artifact.environment.appBuild} · ${artifact.environment.gitSha}  `,
    `Network: ${artifact.environment.network} · Fixture: ${artifact.environment.fixture}`,
    '',
    '| Provider | Scenario | Rep | Model | Speech end → first audio (ms) | Barge stop (ms) | Factual preservation |',
    '|---|---:|---:|---|---:|---:|---|',
    ...(rows.length ? rows : ['| pending | — | — | — | — | — | — |']),
    '',
    '## B5 human scoring (score each RU and EN utterance separately, 1–5)',
    '',
    '| Provider | Guide | Language | Naturalness | Dana/Artur fit | Pacing | Pronunciation | Overall comfort |',
    '|---|---|---|---:|---:|---:|---:|---:|',
    '| openai | Dana | RU |  |  |  |  |  |',
    '| openai | Dana | EN |  |  |  |  |  |',
    '| openai | Artur | RU |  |  |  |  |  |',
    '| openai | Artur | EN |  |  |  |  |  |',
    '| gemini | Dana | RU |  |  |  |  |  |',
    '| gemini | Dana | EN |  |  |  |  |  |',
    '| gemini | Artur | RU |  |  |  |  |  |',
    '| gemini | Artur | EN |  |  |  |  |  |',
    '',
    'Latency and subjective scores are intentionally reported separately.',
    '',
    `Cost status: ${artifact.cost.status}. ${artifact.cost.note}`,
  ].join('\n');
}

export function classifyFactualPreservation(
  approvedText?: string,
  providerTranscript?: string,
): FactualComparison {
  if (!approvedText || providerTranscript === undefined) return 'unverifiable';
  const approved = approvedText.trim();
  const rendered = providerTranscript.trim();
  if (approved === rendered) return 'exact';
  if (!rendered) return 'omission';
  const approvedTokens = tokens(approved);
  const renderedTokens = tokens(rendered);
  if (approvedTokens.join(' ') === renderedTokens.join(' ')) return 'near-verbatim';
  const approvedSet = new Set(approvedTokens);
  const renderedSet = new Set(renderedTokens);
  const shared = renderedTokens.filter(token => approvedSet.has(token)).length;
  const precision = renderedTokens.length ? shared / renderedTokens.length : 0;
  const recall = approvedTokens.length
    ? approvedTokens.filter(token => renderedSet.has(token)).length / approvedTokens.length
    : 0;
  if (recall < 0.85 && precision >= 0.9) return 'omission';
  // Lexical divergence alone cannot prove a factual addition. Flag only a
  // strong length/precision mismatch for human review; otherwise stay conservative.
  if (renderedTokens.length > approvedTokens.length * 1.2 && precision < 0.7) return 'added factual claim';
  if (precision >= 0.65 && recall >= 0.65) return 'paraphrased';
  return 'unverifiable';
}

function compactMetrics(value: Record<keyof M4BenchmarkMetrics, number | undefined>): M4BenchmarkMetrics {
  return Object.fromEntries(Object.entries(value).filter(([, amount]) => amount !== undefined)) as M4BenchmarkMetrics;
}

function validateHumanScore(score: M4HumanScore): M4HumanScore {
  return Object.fromEntries(Object.entries(score).map(([key, value]) => [key, Math.max(1, Math.min(5, Math.round(value)))])) as unknown as M4HumanScore;
}

function format(value: number | undefined): string {
  return value === undefined ? '—' : String(value);
}

function tokens(value: string): string[] {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? [];
}
