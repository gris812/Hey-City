import { getSession } from './driveSession';
import { sessionDiscoveryCandidate } from './aheadDiscovery';
import { storyPreparationEnabledFor } from './storyPreparation';
import { recordNarrativeStage, recordUsage } from './usage';
const seen = new WeakMap<object, Set<string>>();
const surfaced = new WeakMap<object, Set<string>>();
/** Telemetry cannot start/finish a Journey moment or change playback authority. */
export async function recordNativeNarrativeEvent(
  sessionId: string,
  userId: string,
  input: unknown,
): Promise<'recorded' | 'duplicate' | 'stale' | 'invalid'> {
  const session = getSession(sessionId);
  if (!session || session.userId !== userId) return 'stale';
  const body = input as Record<string, unknown>;
  if (body?.status === 'surfaced') {
    if (!storyPreparationEnabledFor(userId)) return 'stale';
    if (typeof body.poiId !== 'string') return 'invalid';
    const candidate = sessionDiscoveryCandidate(sessionId, body.poiId);
    if (!candidate) return 'stale';
    const places = surfaced.get(session) ?? new Set<string>();
    if (places.has(candidate.providerId)) return 'duplicate';
    if (places.size >= 32) return 'stale';
    places.add(candidate.providerId);
    surfaced.set(session, places);
    try {
      await recordUsage({ anonymous: true, category: 'product', operation: 'story_surfaced',
        metadata: { poiId: candidate.providerId, objectType: candidate.targetType, sourceSha: process.env.GIT_SHA ?? 'unknown',
          clientSha: typeof body.clientSha === 'string' && /^[a-f0-9]{40}$/.test(body.clientSha) ? body.clientSha : undefined,
          offerId: session.experienceOffer?.poiId === candidate.providerId ? session.experienceOffer.id : undefined } });
    } catch {
      places.delete(candidate.providerId);
      console.warn('story_surfaced_telemetry_unavailable');
    }
    return 'recorded';
  }
  if (
    !body ||
    typeof body.momentId !== 'string' ||
    !['playing', 'paused', 'failed'].includes(String(body.status))
  )
    return 'invalid';
  const moment = session.journeyState?.getActiveMoment();
  if (!moment || moment.momentId !== body.momentId)
    return 'stale';
  const key = `${body.momentId}:${body.status}`;
  const events = seen.get(session) ?? new Set<string>();
  if (events.has(key)) return 'duplicate';
  events.add(key);
  if (events.size > 96) events.delete(events.values().next().value!);
  seen.set(session, events);
  await recordNarrativeStage(
    {
      sessionId,
      momentId: body.momentId,
      stage: 'playback',
      poiId: moment.entityId,
      failureClass: body.status !== 'failed' || body.failure === 'audio_missing' ? undefined
        : body.failure === 'audio_url_invalid' ? 'audio_delivery' : 'playback',
      failure: typeof body.failure === 'string' ? body.failure : undefined,
      status: body.status as 'playing' | 'paused' | 'failed',
      latencyMs:
        typeof body.latencyMs === 'number' ? body.latencyMs : undefined,
      tellLatencyMs: body.status === 'playing' && typeof body.tellLatencyMs === 'number' ? body.tellLatencyMs : undefined,
      clientSha:
        typeof body.clientSha === 'string' ? body.clientSha : undefined,
    },
    userId,
  );
  return 'recorded';
}
