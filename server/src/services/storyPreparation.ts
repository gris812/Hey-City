import { createHash, randomUUID } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import type { DiscoveryCandidate } from '@heycity/shared';
import { aiRouting, media, openai, storyPreparation } from '../config';
import { databaseEnabled, query } from './database';
import { cachedDiscoveryKnowledge, unavailableEvidenceTtl, warmDiscoveryKnowledge } from './discoveryKnowledge';
import type { DriveSession } from './driveSession';
import { storyAvailability } from './evidence';
import { getGuide, guideVersion } from './guides';
import { generateNarrationFromPlan, resolveCompletedNarrationAudio, type GenerateNarrationResult } from './narration';
import { narrativeFingerprint } from './narrativeGenerator';
import { isCityNarrativeCategory } from '../policies/narrativeDepthPolicy';
import { requestContext } from './requestContext';
import { selectedStoryPlan } from './selectedStoryPlan';
import { recordUsage } from './usage';

type Planned = ReturnType<typeof selectedStoryPlan>;
type Stage = 'discovered' | 'evidence_checking' | 'insufficient_evidence' | 'eligible' |
  'text_preparing' | 'text_ready' | 'audio_preparing' | 'audio_ready' |
  'failed' | 'expired' | 'reused' | 'unknown_evidence' | 'deferred';
type Artifact = { id: string; fingerprint: string; result: GenerateNarrationResult; audioAttempted: boolean };
type Pending = {
  id: string;
  poiId: string;
  context: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
  controller: AbortController;
  task?: Promise<Artifact | undefined>;
  fingerprint?: string;
  ready?: 'audio_ready' | 'text_ready';
  audioUrl?: string;
  candidate: DiscoveryCandidate;
  consumed: boolean;
  waiters: number;
};
type SessionPreparation = { current?: Pending; admitted: number; probes: number; previousPoi?: string };
const sessions = new WeakMap<DriveSession, SessionPreparation>();
let running = 0;
let lookups: number[] = [];
let textMs = storyPreparation.estimatedTextMs;
let audioMs = storyPreparation.estimatedAudioMs;

export function preparationWindow(etaSeconds: number, textLatencyMs: number, audioLatencyMs: number, maxLeadSeconds: number) {
  const remainingMs = etaSeconds * 1000;
  if (!Number.isFinite(remainingMs) || remainingMs < textLatencyMs || etaSeconds > maxLeadSeconds) return 'none';
  return remainingMs >= textLatencyMs + audioLatencyMs ? 'audio' : 'text';
}

function context(session: DriveSession) {
  const { mode, voiceId, language, narrationStyle, themeTags } = session.params;
  return JSON.stringify([mode, voiceId, language, narrationStyle, themeTags]);
}

function record(job: Pending, candidate: DiscoveryCandidate, stage: Stage, details: { latencyMs?: number; artifactVersion?: string; cacheHit?: boolean; momentId?: string; reuseMode?: 'in_progress' | 'audio_ready' | 'text_ready' } = {}) {
  // Detached prefetch events contain neither account/session IDs nor exact location or content.
  return recordUsage({ anonymous: true, category: 'product', operation: 'story_preparation',
    metadata: { preparationId: job.id, poiId: candidate.providerId, objectType: candidate.targetType, stage,
      sourceSha: process.env.GIT_SHA ?? 'unknown', ...details } }).catch(() => console.warn('story_preparation_telemetry_unavailable'));
}

export function invalidateStoryPreparation(session: DriveSession | undefined, preservePoiId?: string) {
  const state = session && sessions.get(session);
  const job = state?.current;
  if (!state || !job || job.poiId === preservePoiId) return;
  state.current = undefined;
  clearTimeout(job.timer);
  if (!job.consumed) {
    job.controller.abort();
    void record(job, job.candidate, 'expired');
  }
}

async function preparationFingerprint(planned: Planned, language: string, narrationStyle: string) {
  const guide = await getGuide(planned.plan.guideId);
  return createHash('sha256').update(JSON.stringify([
    narrativeFingerprint({ ...planned, language, narrationStyle }), aiRouting.primaryProvider,
    guideVersion(guide), openai.ttsModel, 'mp3', media.publicApiUrl,
  ])).digest('hex');
}

/** Single staging replica. Atomic daily reservations survive API restarts and fail closed. */
async function reserve(audio: boolean) {
  const { dailyJobs, dailyAudioJobs, dailyEstimatedBudgetUsd, textReservationUsd, audioReservationUsd } = storyPreparation;
  // Reserve a worst-case text amount for every admitted slot, then allocate the remaining
  // estimate to optional audio. Provider billing is tracked separately.
  const textLimit = Math.min(dailyJobs, Math.floor(dailyEstimatedBudgetUsd / textReservationUsd));
  const audioLimit = Math.min(dailyAudioJobs, Math.max(0, Math.floor(
    (dailyEstimatedBudgetUsd - textLimit * textReservationUsd) / audioReservationUsd)));
  const [row] = await query<{ granted: boolean; audio: boolean }>(`
    WITH claimed AS (
      INSERT INTO story_preparation_budget (day, jobs)
      SELECT (now() AT TIME ZONE 'UTC')::date, 1 WHERE $1::int > 0
      ON CONFLICT (day) DO UPDATE SET jobs = story_preparation_budget.jobs + 1
      WHERE story_preparation_budget.jobs < $1
      RETURNING jobs
    )
    SELECT true AS granted, ($2::boolean AND jobs <= $3::int) AS audio FROM claimed
  `, [textLimit, audio, audioLimit]);
  return row?.granted ? row.audio ? 'audio' : 'text' : undefined;
}

export function storyPreparationEnabledFor(userId: string) {
  return storyPreparation.enabled && Boolean(storyPreparation.pilotUserId) &&
    !userId.startsWith('guest_') && userId === storyPreparation.pilotUserId;
}

export async function preparedAudioHint(session: DriveSession, poiId: string) {
  const job = sessions.get(session)?.current;
  if (!job?.audioUrl || job.poiId !== poiId || job.context !== context(session) || job.controller.signal.aborted ||
      job.expiresAt <= Date.now() || !await resolveCompletedNarrationAudio(job.audioUrl) ||
      sessions.get(session)?.current !== job) return undefined;
  const ttlMs = job.expiresAt - Date.now();
  return ttlMs > 0 ? { poiId, ttlMs } : undefined;
}

export function offerStoryPreparation(session: DriveSession, candidate: DiscoveryCandidate | undefined, speedKmh: number) {
  if (!storyPreparationEnabledFor(session.userId) || !databaseEnabled()) return;
  const state = sessions.get(session) ?? { admitted: 0, probes: 0 };
  sessions.set(session, state);
  if (state.current && state.current.waiters === 0 &&
      (state.current.poiId !== candidate?.providerId || state.current.context !== context(session))) {
    invalidateStoryPreparation(session);
  }
  if (!candidate || !candidate.isAhead || session.params.mode !== 'vehicle' || session.muted ||
      session.storyRequest || session.conversationRuntime.blocksNarration() || state.current ||
      state.previousPoi === candidate.providerId || state.admitted >= storyPreparation.sessionJobs ||
      running >= storyPreparation.concurrency || speedKmh <= 0) return;
  const eta = candidate.distanceMeters / (speedKmh / 3.6);
  const window = preparationWindow(eta, textMs, audioMs, storyPreparation.maxLeadSeconds);
  if (window === 'none') return;
  const id = randomUUID();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    if (state.current?.id === id) invalidateStoryPreparation(session);
    controller.abort();
  }, storyPreparation.ttlMs);
  timer.unref();
  const job: Pending = { id, poiId: candidate.providerId, context: context(session),
    expiresAt: Date.now() + storyPreparation.ttlMs, timer, controller, candidate, consumed: false, waiters: 0 };
  state.current = job;
  running++;
  const run = async () => {
    await record(job, candidate, 'discovered');
    await record(job, candidate, 'evidence_checking');
    const cached = await cachedDiscoveryKnowledge(candidate);
    if (controller.signal.aborted || session.storyRequest) return;
    let knowledge = cached;
    if (!cached && !isCityNarrativeCategory(candidate.targetType) && state.probes < storyPreparation.sessionJobs) {
      const now = Date.now();
      lookups = lookups.filter(time => now - time < 60_000);
      if (lookups.length < storyPreparation.freeLookupsPerMinute) {
        lookups.push(now);
        state.probes++;
        knowledge = await warmDiscoveryKnowledge(candidate);
      }
    }
    if (controller.signal.aborted || session.storyRequest) return;
    if (!knowledge?.evidence || !storyAvailability(knowledge.evidence).short) {
      await record(job, candidate, knowledge && unavailableEvidenceTtl(knowledge) ? 'insufficient_evidence' : 'unknown_evidence');
      state.previousPoi = candidate.providerId;
      return;
    }
    const params = { ...session.params };
    const planned = selectedStoryPlan(session, params, candidate, knowledge.evidence, 'short', false);
    const fingerprint = await preparationFingerprint(planned, params.language, params.narrationStyle);
    // Separate text and audio controls. The optional audio slot is reserved independently.
    if (controller.signal.aborted || session.storyRequest || context(session) !== job.context) return;
    job.fingerprint = fingerprint;
    const freeMediaBytes = window === 'audio'
      ? await statfs(media.directory).then(stats => stats.bavail * stats.bsize, () => 0) : 0;
    const budget = await reserve(window === 'audio' && freeMediaBytes >= storyPreparation.minFreeMediaBytes);
    if (!budget) { state.previousPoi = candidate.providerId; await record(job, candidate, 'deferred'); return; }
    state.admitted++;
    state.previousPoi = candidate.providerId;
    controller.signal.throwIfAborted();
    await record(job, candidate, 'eligible', { artifactVersion: fingerprint });
    await record(job, candidate, 'text_preparing');
    const startedAt = Date.now();
    let textReadyAt = startedAt;
    const shouldPrepareAudio = budget === 'audio';
    const result = await requestContext.run({ userId: session.userId, storyCorrelationId: job.id }, () =>
      generateNarrationFromPlan(planned.plan, {
        ...planned, language: params.language, narrationStyle: params.narrationStyle,
        userId: session.userId, signal: controller.signal, completeAudio: true, textOnly: !shouldPrepareAudio,
        onTextReady: async cached => {
          textReadyAt = Date.now();
          if (!cached) textMs = 0.75 * textMs + 0.25 * (textReadyAt - startedAt);
          await record(job, candidate, 'text_ready', { latencyMs: textReadyAt - startedAt, cacheHit: cached });
          if (shouldPrepareAudio) await record(job, candidate, 'audio_preparing');
        },
      }));
    if (shouldPrepareAudio) {
      const latencyMs = Date.now() - textReadyAt;
      if (result.audioUrl && !result.cached) audioMs = 0.75 * audioMs + 0.25 * latencyMs;
      await record(job, candidate, result.audioUrl ? 'audio_ready' : 'failed', { latencyMs, cacheHit: result.cached });
    }
    job.ready = result.audioUrl ? 'audio_ready' : 'text_ready';
    job.audioUrl = result.audioUrl || undefined;
    return { id, fingerprint, result, audioAttempted: shouldPrepareAudio };
  };
  job.task = run().catch(async () => {
    if (!controller.signal.aborted) await record(job, candidate, 'failed');
    return undefined;
  }).finally(() => {
    running--;
    if (controller.signal.aborted && state.current === job) state.current = undefined;
  });
}

export async function reuseStoryPreparation(session: DriveSession, candidate: DiscoveryCandidate, planned: Planned,
  language: string, narrationStyle: string, signal: AbortSignal, momentId: string) {
  const job = sessions.get(session)?.current;
  if (!job?.task || !job.fingerprint || job.poiId !== candidate.providerId ||
      job.expiresAt <= Date.now() || job.context !== context(session)) return undefined;
  const fingerprint = await preparationFingerprint(planned, language, narrationStyle);
  signal.throwIfAborted();
  if (fingerprint !== job.fingerprint || job.controller.signal.aborted) return undefined;
  const reuseMode = job.ready ?? 'in_progress';
  job.waiters++;
  try {
    const artifact = await new Promise<Artifact | undefined>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      job.task!.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
    signal.throwIfAborted();
    if (job.controller.signal.aborted || sessions.get(session)?.current !== job) return undefined;
    if (artifact) {
      job.consumed = true;
      await record(job, candidate, 'reused', { momentId, reuseMode });
    }
    signal.throwIfAborted();
    return artifact;
  } finally {
    job.waiters--;
  }
}
