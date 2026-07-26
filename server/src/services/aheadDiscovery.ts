import type { AheadDiscoveryDiagnostic, MovementContext } from '@heycity/shared';
import { aheadDiscovery } from '../config';
import { createCandidateGeometry, deriveHeadingFromMovement, projectedSearchPoint, validateMovementContext } from './aheadDiscoveryGeometry';
import { filterAheadCandidates } from './aheadDiscoveryFiltering';
import { chooseBestCandidate, scoreCandidate } from './aheadDiscoveryScoring';
import { googleAheadDiscoveryProvider } from './googleAheadDiscoveryProvider';
import type { DiscoveryCandidate, DiscoveryDataProvider, ProviderDiscoveryCandidate } from './aheadDiscoveryTypes';

type AheadDiscoverySessionState = {
  previousMovement: MovementContext | null;
  candidates: ProviderDiscoveryCandidate[];
  lastRefreshedAtMs: number | null;
  refreshInProgress: boolean;
  selectedTarget?: DiscoveryCandidate;
  lastErrorCode?: string;
};

const states = new Map<string, AheadDiscoverySessionState>();

function getState(sessionId: string): AheadDiscoverySessionState {
  const existing = states.get(sessionId);
  if (existing) return existing;
  const state: AheadDiscoverySessionState = {
    previousMovement: null,
    candidates: [],
    lastRefreshedAtMs: null,
    refreshInProgress: false,
  };
  states.set(sessionId, state);
  return state;
}

export function clearAheadDiscoverySession(sessionId: string): void {
  states.delete(sessionId);
}

export function createMovementContext(input: {
  latitude: number;
  longitude: number;
  headingDegrees: number | null;
  speedKmh: number | null;
  accuracyMeters?: number;
  timestampMs: number;
}): MovementContext {
  return {
    latitude: input.latitude,
    longitude: input.longitude,
    headingDegrees:
      typeof input.headingDegrees === 'number' && input.headingDegrees >= 0
        ? input.headingDegrees
        : null,
    speedMps: typeof input.speedKmh === 'number' ? input.speedKmh / 3.6 : null,
    accuracyMeters: input.accuracyMeters ?? 25,
    timestamp: new Date(input.timestampMs).toISOString(),
  };
}

export async function evaluateAheadDiscovery(input: {
  sessionId: string;
  movement: MovementContext;
  forceRefresh?: boolean;
  provider?: DiscoveryDataProvider;
  nowMs?: number;
}): Promise<AheadDiscoveryDiagnostic> {
  const provider = input.provider ?? googleAheadDiscoveryProvider;
  const nowMs = input.nowMs ?? Date.now();
  const state = getState(input.sessionId);
  const stableHeading = deriveHeadingFromMovement(state.previousMovement, input.movement);
  const movement = { ...input.movement, headingDegrees: stableHeading };
  state.previousMovement = movement;

  const validationHold = validateMovementContext(movement, nowMs);
  if (validationHold) {
    logAheadDiscovery('ahead_discovery_hold', {
      sessionId: input.sessionId,
      holdReason: validationHold,
    });
    return createDiagnostic({
      state,
      movement,
      forced: Boolean(input.forceRefresh),
      decision: { type: 'hold', reason: validationHold },
      loading: false,
      refreshDue: false,
    });
  }

  const refreshDue = isRefreshDue(state, nowMs, Boolean(input.forceRefresh));
  if (refreshDue) {
    if (state.refreshInProgress) {
      logAheadDiscovery('ahead_discovery_hold', {
        sessionId: input.sessionId,
        holdReason: 'refresh_in_progress',
      });
      return createDiagnostic({
        state,
        movement,
        forced: Boolean(input.forceRefresh),
        decision: { type: 'hold', reason: 'refresh_in_progress' },
        loading: true,
        refreshDue,
      });
    }
    await refreshProviderCandidates(input.sessionId, state, movement, provider, nowMs, Boolean(input.forceRefresh));
  }

  return evaluateCandidateSet({
    sessionId: input.sessionId,
    state,
    movement,
    forced: Boolean(input.forceRefresh),
    refreshDue,
  });
}

function isRefreshDue(
  state: AheadDiscoverySessionState,
  nowMs: number,
  forceRefresh: boolean
): boolean {
  if (forceRefresh) return true;
  if (!state.lastRefreshedAtMs || state.candidates.length === 0) return true;
  return nowMs - state.lastRefreshedAtMs >= aheadDiscovery.providerRefreshMinutes * 60 * 1000;
}

async function refreshProviderCandidates(
  sessionId: string,
  state: AheadDiscoverySessionState,
  movement: MovementContext,
  provider: DiscoveryDataProvider,
  nowMs: number,
  forced: boolean
): Promise<void> {
  state.refreshInProgress = true;
  const startedAt = Date.now();
  logAheadDiscovery('ahead_discovery_provider_refresh_started', {
    sessionId,
    forced,
    location: roundedLocation(movement),
    stableHeading: movement.headingDegrees,
  });

  try {
    state.candidates = await provider.searchAhead({
      movement,
      projectedPoint: projectedSearchPoint(movement),
      radiusMeters: aheadDiscovery.searchRadiusMeters,
      limit: aheadDiscovery.providerLimit,
    });
    state.lastRefreshedAtMs = nowMs;
    state.lastErrorCode = undefined;
    logAheadDiscovery('ahead_discovery_provider_refresh_completed', {
      sessionId,
      candidateCount: state.candidates.length,
      providerLatencyMs: Date.now() - startedAt,
    });
  } catch (e) {
    state.lastErrorCode = safeErrorCode(e);
    logAheadDiscovery('ahead_discovery_provider_refresh_failed', {
      sessionId,
      providerLatencyMs: Date.now() - startedAt,
      providerErrorCode: state.lastErrorCode,
    });
  } finally {
    state.refreshInProgress = false;
  }
}

function evaluateCandidateSet(input: {
  sessionId: string;
  state: AheadDiscoverySessionState;
  movement: MovementContext;
  forced: boolean;
  refreshDue: boolean;
}): AheadDiscoveryDiagnostic {
  const candidates = input.state.candidates.map((candidate) => ({
    ...candidate,
    ...createCandidateGeometry(input.movement, candidate),
  }));
  const filtered = filterAheadCandidates(candidates);

  for (const excluded of filtered.excluded) {
    logAheadDiscovery('ahead_discovery_candidate_filtered', {
      sessionId: input.sessionId,
      selectedTargetId: excluded.providerId,
      selectedTargetName: excluded.name,
      exclusionReason: excluded.reason,
    });
  }

  if (input.state.lastErrorCode && input.state.candidates.length === 0) {
    logAheadDiscovery('ahead_discovery_hold', {
      sessionId: input.sessionId,
      holdReason: 'provider_unavailable',
      providerErrorCode: input.state.lastErrorCode,
    });
    return createDiagnostic({
      state: input.state,
      movement: input.movement,
      forced: input.forced,
      decision: { type: 'hold', reason: 'provider_unavailable' },
      loading: false,
      refreshDue: input.refreshDue,
      filtered,
    });
  }

  if (candidates.length === 0) {
    logAheadDiscovery('ahead_discovery_hold', {
      sessionId: input.sessionId,
      holdReason: 'no_candidates',
    });
    return createDiagnostic({
      state: input.state,
      movement: input.movement,
      forced: input.forced,
      decision: { type: 'hold', reason: 'no_candidates' },
      loading: false,
      refreshDue: input.refreshDue,
      filtered,
    });
  }

  if (filtered.included.length === 0) {
    const reason = filtered.excluded.some((item) => item.reason === 'behind_user')
      ? 'no_candidate_ahead'
      : 'all_candidates_filtered';
    logAheadDiscovery('ahead_discovery_hold', { sessionId: input.sessionId, holdReason: reason });
    return createDiagnostic({
      state: input.state,
      movement: input.movement,
      forced: input.forced,
      decision: { type: 'hold', reason },
      loading: false,
      refreshDue: input.refreshDue,
      filtered,
    });
  }

  const currentTarget = input.state.selectedTarget
    ? {
        ...input.state.selectedTarget,
        ...createCandidateGeometry(input.movement, input.state.selectedTarget),
      }
    : undefined;
  const selection = chooseBestCandidate(filtered.included, currentTarget);
  if (!selection.selected) {
    logAheadDiscovery('ahead_discovery_hold', {
      sessionId: input.sessionId,
      holdReason: 'no_candidates',
    });
    return createDiagnostic({
      state: input.state,
      movement: input.movement,
      forced: input.forced,
      decision: { type: 'hold', reason: 'no_candidates' },
      loading: false,
      refreshDue: input.refreshDue,
      filtered,
    });
  }

  input.state.selectedTarget = selection.selected.candidate;
  const refreshedAt = input.state.lastRefreshedAtMs
    ? new Date(input.state.lastRefreshedAtMs).toISOString()
    : new Date().toISOString();
  const nextRefreshAt = nextRefreshIso(input.state);
  const eventType = selection.retained
    ? 'ahead_discovery_target_retained'
    : selection.replaced
      ? 'ahead_discovery_target_replaced'
      : 'ahead_discovery_target_selected';
  logAheadDiscovery(eventType, {
    sessionId: input.sessionId,
    selectedTargetId: selection.selected.candidate.providerId,
    selectedTargetName: selection.selected.candidate.name,
    selectedTargetType: selection.selected.candidate.targetType,
    score: selection.selected.score,
    reasons: selection.selected.reasons,
  });

  return createDiagnostic({
    state: input.state,
    movement: input.movement,
    forced: input.forced,
    loading: false,
    refreshDue: input.refreshDue,
    filtered,
    decision: {
      type: 'target_selected',
      target: selection.selected.candidate,
      score: selection.selected.score,
      reasons: selection.selected.reasons,
      refreshedAt,
      nextProviderRefreshAt: nextRefreshAt ?? refreshedAt,
    },
  });
}

function createDiagnostic(input: {
  state: AheadDiscoverySessionState;
  movement: MovementContext;
  forced: boolean;
  loading: boolean;
  refreshDue: boolean;
  decision: AheadDiscoveryDiagnostic['decision'];
  filtered?: ReturnType<typeof filterAheadCandidates>;
}): AheadDiscoveryDiagnostic {
  const included = input.filtered?.included ?? [];
  const excluded = input.filtered?.excluded ?? [];
  return {
    provider: 'google',
    movement: input.movement,
    providerRefresh: {
      configuredIntervalMinutes: aheadDiscovery.providerRefreshMinutes,
      lastRefreshedAt: input.state.lastRefreshedAtMs
        ? new Date(input.state.lastRefreshedAtMs).toISOString()
        : null,
      nextRefreshAt: nextRefreshIso(input.state),
      refreshDue: input.refreshDue,
      loading: input.loading,
      forced: input.forced,
      errorCode: input.state.lastErrorCode,
    },
    decision: input.decision,
    candidateCount: input.state.candidates.length,
    includedCandidateCount: included.length,
    excludedCandidateCount: excluded.length,
    exclusionReasonsSummary: input.filtered?.summary ?? {},
    topCandidates: included
      .map((candidate) => scoreCandidate(candidate, input.state.selectedTarget?.providerId))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => ({ ...item.candidate, score: item.score, reasons: item.reasons })),
    excludedCandidates: excluded.slice(0, 8),
  };
}

function nextRefreshIso(state: AheadDiscoverySessionState): string | null {
  if (!state.lastRefreshedAtMs) return null;
  return new Date(
    state.lastRefreshedAtMs + aheadDiscovery.providerRefreshMinutes * 60 * 1000
  ).toISOString();
}

function safeErrorCode(error: unknown): string {
  const message = (error as Error).message || 'provider_unavailable';
  if (message.includes('missing_google_key')) return 'missing_google_key';
  if (message.includes('quota_or_rate_limit')) return 'quota_or_rate_limit';
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('malformed')) return 'malformed_provider_response';
  return 'provider_unavailable';
}

function roundedLocation(movement: MovementContext) {
  return {
    latitude: Math.round(movement.latitude * 10000) / 10000,
    longitude: Math.round(movement.longitude * 10000) / 10000,
  };
}

function logAheadDiscovery(event: string, payload: Record<string, unknown>): void {
  console.info(JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload }));
}
