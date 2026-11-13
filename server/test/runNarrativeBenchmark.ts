import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  randomEntities,
  nearbyEntities,
  samplingVersion,
  blindPair,
  BENCHMARK_RUBRIC,
  type BenchmarkEntity,
} from './narrativeBenchmark';
import { retrieveDiscoveryKnowledge } from '../src/services/discoveryKnowledge';
import { prepareNarrative } from '../src/services/narrativePlan';
import { NarrativeGenerator } from '../src/services/narrativeGenerator';
import { createDefaultAITaskRouter } from '../src/ai/aiTaskRouter';
import { storyAvailability } from '../src/services/evidence';
import { openai } from '../src/config';
import { knowledgePolicy } from '../src/policies/knowledgePolicy';

const args = process.argv.slice(2);
const arg = (name: string, fallback?: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
function positive(value: string | undefined, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${label} must be explicitly positive`);
  return n;
}
let seed = Number(arg('--seed', '20261109'));
const language = arg('--language', 'en')!;
const seconds = 30;
const geminiModel = process.env.BENCHMARK_GEMINI_MODEL;
const geminiKey = process.env.GEMINI_API_KEY;
let reserved = 0;
const metrics: {
  provider: string;
  model: string;
  latencyMs: number;
  estimatedCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}[] = [];
let budget = 0,
  geminiInput = 0,
  geminiOutput = 0;
function reserve(cost: number): void {
  if (!Number.isFinite(cost) || cost < 0 || reserved + cost > budget)
    throw new Error('benchmark_cost_limit');
  reserved += cost;
}
async function gemini(prompt: string): Promise<string> {
  const maxTokens = 900;
  // Conservative UTF-8 byte upper bound rather than optimistic chars/4; reserve before network.
  reserve(
    (Buffer.byteLength(prompt) / 1e6) * geminiInput +
      (maxTokens / 1e6) * geminiOutput,
  );
  const started = performance.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(45000),
      headers: {
        'x-goog-api-key': geminiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
      }),
    },
  );
  // No automatic retry of ambiguous paid POSTs. Replay is explicit and bounded by a new budget.
  if (!response.ok) throw new Error(`gemini_http_${response.status}`);
  const data = (await response.json()) as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();
  const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens =
    (data.usageMetadata?.candidatesTokenCount ?? 0) +
    (data.usageMetadata?.thoughtsTokenCount ?? 0);
  metrics.push({
    provider: 'gemini',
    model: geminiModel!,
    latencyMs: performance.now() - started,
    inputTokens,
    outputTokens,
    estimatedCostUsd:
      (inputTokens * geminiInput + outputTokens * geminiOutput) / 1e6,
  });
  if (!text || candidate?.finishReason !== 'STOP')
    throw new Error('gemini_incomplete');
  return text;
}
async function run() {
  // Research uses a separate production allowance and is excluded from the benchmark spend.
  knowledgePolicy.researchEnabled = false;
  if (!Number.isSafeInteger(seed) || !['en', 'ru'].includes(language))
    throw new Error('Invalid seed/language');
  const replay = arg('--replay');
  let entities: BenchmarkEntity[];
  if (replay) {
    const recorded = JSON.parse(await readFile(replay, 'utf8'));
    if (arg('--seed') === undefined && Number.isSafeInteger(recorded.seed))
      seed = recorded.seed;
    entities = recorded.entities;
    if (!Array.isArray(entities) || !entities.length || entities.length > 20)
      throw new Error('Invalid replay manifest');
  } else {
    if (arg('--lat') === undefined || arg('--lng') === undefined)
      throw new Error(
        'Supply --lat and --lng for a public test coordinate, or --replay; never assume phone GPS',
      );
    entities = [
      ...(await nearbyEntities(
        Number(arg('--lat')),
        Number(arg('--lng')),
        seed,
      )),
      ...randomEntities(seed),
    ];
  }
  const out = arg('--out', '../evaluation/narrative/latest-run.json')!;
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const dirty = !!execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  }).trim();
  const report: any = {
    schemaVersion: 1,
    seed,
    samplingVersion,
    sourceSha,
    sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
      encoding: 'utf8',
    }).trim(),
    dirty,
    language,
    durationSec: seconds,
    samplingBias:
      'Nearby frame: geotagged English Wikipedia pages in supplied 10km test area; random frame: versioned worldwide catalog, stratified region/type/coverage. Coverage strata are hypotheses, not measured evidence.',
    entities,
    models: {
      heycity: openai.textModel,
      gemini: geminiModel ?? 'not_configured',
    },
    configuration: {
      gemini: { temperature: 0.7, maxOutputTokens: 900 },
      knowledgeResearch: 'disabled for benchmark cost isolation',
      heycity: 'production config/plan/guide; no benchmark generator',
    },
    rubric: BENCHMARK_RUBRIC,
    results: [],
    metrics,
    status: 'SAMPLED_NOT_GENERATED',
    cost: { reservedUpperBoundUsd: 0 },
    tts: {
      status: 'not_run',
      note: 'Narrative quality benchmark isolates text. Existing evaluate:m1 exercises production TTS; first audible audio requires native field telemetry.',
    },
  };
  const save = async () => {
    report.cost.reservedUpperBoundUsd = reserved;
    report.cost.reportedUsageEstimateUsd = metrics.reduce(
      (sum, m) => sum + (m.estimatedCostUsd ?? 0),
      0,
    );
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(report, null, 2) + '\n');
  };
  await save();
  if (!args.includes('--live') && !args.includes('--knowledge-only')) {
    console.log(
      JSON.stringify({
        status: report.status,
        seed,
        objects: entities.map((e) => e.candidate.name),
        out,
      }),
    );
    return;
  }
  if (args.includes('--knowledge-only')) {
    for (const item of entities) {
      const started = performance.now();
      const result = await retrieveDiscoveryKnowledge(item.candidate);
      report.results.push({
        entityId: item.candidate.providerId,
        name: item.candidate.name,
        retrievalMs: performance.now() - started,
        attempts: result.attempts,
        entity: result.entity,
        availability: result.evidence
          ? storyAvailability(result.evidence)
          : { short: false, long: false },
        claimCount: result.evidence?.items.length ?? 0,
        sourceUrls: [...new Set(result.evidence?.items.flatMap(item => item.sourceUrl ? [item.sourceUrl] : []) ?? [])],
      });
      await save();
      console.log(
        JSON.stringify({
          name: item.candidate.name,
          availability: report.results.at(-1).availability,
        }),
      );
    }
    report.status = 'KNOWLEDGE_MEASURED_NO_NARRATIVE_COMPARISON';
    await save();
    return;
  }
  if (
    !openai.apiKey ||
    !geminiKey ||
    !geminiModel ||
    !/^[a-zA-Z0-9._-]+$/.test(geminiModel)
  )
    throw new Error(
      'Live run requires OPENAI_API_KEY, GEMINI_API_KEY and explicit BENCHMARK_GEMINI_MODEL',
    );
  budget = positive(arg('--budget-usd'), '--budget-usd');
  geminiInput = positive(
    process.env.BENCHMARK_GEMINI_INPUT_USD_PER_MILLION,
    'Gemini input price',
  );
  geminiOutput = positive(
    process.env.BENCHMARK_GEMINI_OUTPUT_USD_PER_MILLION,
    'Gemini output price',
  );
  const router = createDefaultAITaskRouter();
  const routeGenerate = router.generate.bind(router);
  router.generate = async (request) => {
    reserve(
      ((Buffer.byteLength(request.instructions) +
        Buffer.byteLength(request.input) +
        500) /
        1e6) *
        openai.textInputUsdPerMillion +
        ((request.maxOutputTokens ?? openai.maxOutputTokens) / 1e6) *
          openai.textOutputUsdPerMillion,
    );
    const started = performance.now();
    const result = await routeGenerate(request);
    metrics.push({
      provider: result?.providerId ?? 'none',
      model: result?.model ?? 'none',
      latencyMs: performance.now() - started,
      ...result?.usage,
    });
    return result;
  };
  const generator = new NarrativeGenerator(router);
  report.status = 'RUNNING';
  await save();
  try {
    // Sequential is intentional bounded concurrency=1. No surprise paid retries.
    for (const [index, item] of entities.entries()) {
      if (reserved >= budget) break;
      const row: any = {
        entityId: item.candidate.providerId,
        name: item.candidate.name,
        group: item.group,
      };
      report.results.push(row);
      try {
        let started = performance.now();
        const knowledge = await retrieveDiscoveryKnowledge(item.candidate);
        row.retrieval = {
          latencyMs: performance.now() - started,
          attempts: knowledge.attempts,
          entity: knowledge.entity,
        };
        if (
          !knowledge.evidence ||
          !storyAvailability(knowledge.evidence).short
        ) {
          row.status = 'insufficient_evidence';
          continue;
        }
        const evidence = knowledge.evidence;
        row.sources = evidence.items.map(
          ({ id, claim, sourceType, sourceUrl }) => ({
            id,
            claim,
            sourceType,
            sourceUrl,
          }),
        );
        const request = prepareNarrative(
          {
            poiId: evidence.subjectId,
            placeName: evidence.subjectName,
            mode: 'walking',
            guideId: 'dana',
            themeTags: ['mixed'],
            targetDurationSec: seconds,
          },
          evidence,
          { level: 'short', language },
        );
        started = performance.now();
        const hey = await generator.generate({
          ...request,
          language,
          narrationStyle: 'conversational',
          signal: AbortSignal.timeout(45000),
        });
        if (hey.providerId === 'deterministic')
          throw new Error('Demo output is not a measured story');
        row.heycity = { ...hey, latencyMs: performance.now() - started };
        const context = {
          identity: item.candidate.name,
          type: item.candidate.targetType,
          language,
          durationSeconds: request.plan.targetDurationSec,
          guide: request.policy,
          selection:
            'Explicit request, not arrival; location is not current listener position',
          objectives:
            'An intriguing opening, one angle, natural spoken storytelling, meaningful local context. No invented facts, quotes, lists, spoken citations, route instructions or padding.',
        };
        const controlled = JSON.stringify({
          ...context,
          evidence: request.brief.evidence.items
            .filter((x) => request.brief.selectedEvidenceRefs.includes(x.id))
            .map((x) => x.claim),
        });
        const ordinary = `Tell me an interesting spoken story about ${item.candidate.name}. Language ${language}; about ${request.plan.targetDurationSec} seconds. I am exploring this area; do not assume I am standing at the object or give driving instructions.`;
        row.comparisons = [];
        for (const [condition, prompt] of [
          ['controlled', controlled],
          ['ordinary', ordinary],
        ]) {
          const text = await gemini(prompt);
          const pair = blindPair(
            hey.text,
            text,
            seed + index * 2 + (condition === 'ordinary' ? 1 : 0),
          );
          row.comparisons.push({
            condition,
            geminiText: text,
            blindAnswers: pair.answers,
            mapping: pair.mapping,
            evaluation: 'pending_independent_review',
          });
        }
        row.status = 'generated_review_pending';
      } catch (error) {
        row.status = 'failed';
        row.errorCode =
          error instanceof Error && error.message === 'benchmark_cost_limit'
            ? 'cost_limit'
            : 'benchmark_stage_failed';
        if (row.errorCode === 'cost_limit') break;
      } finally {
        await save();
      }
    }
    report.status =
      report.results.length === entities.length &&
      report.results.every((r: any) => r.status === 'generated_review_pending')
        ? 'GENERATED_REVIEW_PENDING'
        : 'PARTIAL_NOT_ACCEPTED';
  } finally {
    await save();
  }
  // Separate blinded packet; mapping/source/provider identities are excluded from the judge input.
  await writeFile(
    out.replace(/\.json$/, '') + '.blind.json',
    JSON.stringify(
      {
        rubric: BENCHMARK_RUBRIC,
        pairs: report.results.flatMap(
          (r: any) =>
            r.comparisons?.map((c: any) => ({
              id: `${r.entityId}:${c.condition}`,
              context: { name: r.name, language, durationSec: seconds },
              answers: c.blindAnswers,
            })) ?? [],
        ),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      out,
      cost: report.cost,
      comparisons: metrics.length,
    }),
  );
}
void run().catch(() => {
  console.error(
    'Benchmark stopped: check required coordinates/credentials/model/prices/budget; no secret/provider payload logged.',
  );
  process.exitCode = 1;
});
