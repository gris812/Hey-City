import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: node summarize-benchmark.mjs <benchmark-run.json> [summary.md]');
const artifact = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
if (artifact.schemaVersion !== 1 || artifact.environment?.mode !== 'live_native') {
  throw new Error('Expected an M4 schemaVersion=1 live_native artifact');
}
const pricing = parsePricing(process.env.M4_BENCHMARK_PRICING_JSON);
const summaries = ['openai', 'gemini'].map(provider => summarizeProvider(provider));
const output = process.argv[3] ? resolve(process.argv[3]) : resolve('evaluation/m4-live/benchmark-summary.generated.md');
writeFileSync(output, markdown());
process.stdout.write(`${output}\n`);

function summarizeProvider(provider) {
  const rows = artifact.trials.filter(trial => trial.provider === provider && trial.completedAt);
  const counts = Object.fromEntries(['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].map(id => [id, rows.filter(row => row.scenario === id).length]));
  const rates = pricing?.providers?.[provider];
  const costs = rows.map(row => rates && row.usage ? cost(row.usage, rates) : undefined);
  const measuredCosts = costs.filter(value => Number.isFinite(value));
  const totalCost = measuredCosts.reduce((sum, value) => sum + value, 0);
  const activeMs = rows.reduce((sum, row) => sum + span(row.events, 'speech_start', 'response_complete'), 0);
  const sessionMs = rows.reduce((sum, row) => sum + span(row.events, 'talk_tap', 'session_close'), 0);
  const dutyCycle = sessionMs > 0 ? activeMs / sessionMs : undefined;
  const costPerActiveMinute = activeMs > 0 && measuredCosts.length === rows.length ? totalCost / (activeMs / 60_000) : undefined;
  const projected30 = costPerActiveMinute !== undefined && dutyCycle !== undefined ? costPerActiveMinute * 30 * dutyCycle : undefined;
  return {
    provider, rows, counts,
    ready: rows.length >= 18 && Object.values(counts).every(count => count >= 3),
    firstAudioP50: percentile(rows.map(row => row.metrics?.speechEndToFirstAudioMs), 0.5),
    firstAudioP95: percentile(rows.map(row => row.metrics?.speechEndToFirstAudioMs), 0.95),
    bargeP50: percentile(rows.map(row => row.metrics?.bargeInStopLatencyMs), 0.5),
    bargeP95: percentile(rows.map(row => row.metrics?.bargeInStopLatencyMs), 0.95),
    costRun: measuredCosts.length === rows.length && rows.length ? totalCost / rows.length : undefined,
    costPerActiveMinute,
    dutyCycle,
    projected30,
    pricingSource: pricing?.source ?? 'unavailable',
  };
}

function cost(usage, rates) {
  return (
    (usage.inputTextTokens ?? 0) * (rates.inputTextUsdPerMillion ?? 0) +
    (usage.outputTextTokens ?? 0) * (rates.outputTextUsdPerMillion ?? 0) +
    (usage.inputAudioTokens ?? 0) * (rates.inputAudioUsdPerMillion ?? 0) +
    (usage.outputAudioTokens ?? 0) * (rates.outputAudioUsdPerMillion ?? 0)
  ) / 1_000_000;
}

function span(events, startName, endName) {
  const start = events.find(event => event.name === startName)?.atMonotonicMs;
  const end = events.findLast?.(event => event.name === endName)?.atMonotonicMs
    ?? [...events].reverse().find(event => event.name === endName)?.atMonotonicMs;
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

function percentile(values, quantile) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function parsePricing(value) {
  if (!value) return undefined;
  const parsed = JSON.parse(value);
  if (!parsed.source || !parsed.providers) throw new Error('Pricing JSON requires source and providers');
  return parsed;
}

function fmt(value, suffix = '') {
  return value === undefined ? 'unavailable' : `${Number(value).toFixed(4)}${suffix}`;
}

function markdown() {
  const rows = summaries.map(summary => `| ${summary.provider} | ${summary.ready ? 'ready' : 'incomplete'} | ${summary.rows.length} | ${fmt(summary.firstAudioP50, ' ms')} | ${fmt(summary.firstAudioP95, ' ms')} | ${fmt(summary.bargeP50, ' ms')} | ${fmt(summary.bargeP95, ' ms')} | ${fmt(summary.costRun, ' USD')} | ${fmt(summary.costPerActiveMinute, ' USD')} | ${fmt(summary.dutyCycle === undefined ? undefined : summary.dutyCycle * 100, '%')} | ${fmt(summary.projected30, ' USD')} |`);
  return [
    '# M4 live/native benchmark summary', '',
    `Run: \`${artifact.runId}\` · ${artifact.environment.device} · ${artifact.environment.os} · ${artifact.environment.appBuild}`,
    '',
    '| Provider | Gate | Trials | First audio p50 | First audio p95 | Barge p50 | Barge p95 | Cost/run | Cost/active min | Duty cycle | Projected 30 min |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows,
    '',
    `Pricing source: ${summaries.map(item => `${item.provider}=${item.pricingSource}`).join(', ')}. Missing measured usage or rates are reported as unavailable, not zero.`,
    '',
    summaries.every(summary => summary.ready)
      ? 'Provider selection remains a separate Architecture/Product decision using this live data.'
      : 'BLOCKED: each provider requires at least three completed repetitions of every B1-B6 scenario.',
    '',
    'Subjective B5 scores remain separate from latency and cost.',
  ].join('\n');
}
