import { getSession } from './driveSession';
import { recordNarrativeStage } from './usage';
const seen = new WeakMap<object, Set<string>>();
/** Telemetry cannot start/finish a Journey moment or change playback authority. */
export async function recordNativeNarrativeEvent(
  sessionId: string,
  userId: string,
  input: unknown,
): Promise<'recorded' | 'duplicate' | 'stale' | 'invalid'> {
  const session = getSession(sessionId);
  if (!session || session.userId !== userId) return 'stale';
  const body = input as Record<string, unknown>;
  if (
    !body ||
    typeof body.momentId !== 'string' ||
    !['playing', 'paused', 'failed'].includes(String(body.status))
  )
    return 'invalid';
  if (session.journeyState?.getActiveMoment()?.momentId !== body.momentId)
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
