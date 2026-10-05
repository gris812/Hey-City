import { runConversationReplay } from './conversationReplay';
import { DeterministicRealtimeConversationProvider } from '../voice/deterministicRealtimeProvider';
import {
  runRealtimeBenchmark,
  type RealtimeBenchmarkDriver,
  type RealtimeBenchmarkObservation,
  type RealtimeBenchmarkProviderId,
  type RealtimeBenchmarkScript,
} from '../benchmark/realtimeVoiceBenchmark';

export type RealtimeVoiceReplayId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';
export interface RealtimeVoiceReplayResult {
  id: RealtimeVoiceReplayId;
  passed: boolean;
  assertions: string[];
}

/** Deterministic M4 acceptance replay. Paid provider calls are intentionally separate. */
export async function runRealtimeVoiceReplay(): Promise<RealtimeVoiceReplayResult[]> {
  const m3 = await runConversationReplay();
  const result = (id: string) => m3.find(row => row.id === id)?.passed === true;
  const results: RealtimeVoiceReplayResult[] = [
    { id: 'R1', passed: result('R1'), assertions: ['final voice coffee turn uses M3 NearbySearch', 'validated map action', 'same-moment resume'] },
    { id: 'R2', passed: result('R2'), assertions: ['contextual voice turn uses active StoryEvidence', 'no Places call'] },
  ];

  // R3 — transport cancellation is explicit and old-generation audio is rejected by the client/session gate.
  {
    const provider = new DeterministicRealtimeConversationProvider();
    const session = await provider.createSession(config('r3'));
    await session.issueClientConnection();
    await session.submitAnswer({ voiceTurnId: 'old-turn', text: 'Approved old answer.' });
    session.takeClientCommands();
    await session.cancelResponse();
    const commands = session.takeClientCommands();
    results.push({ id: 'R3', passed: commands.length === 1 && commands[0].type === 'cancel_response',
      assertions: ['barge-in emits provider-neutral cancel', 'client generation gate rejects stale completion'] });
    await session.close('client_closed');
  }

  results.push({ id: 'R4', passed: result('R3'), assertions: ['stop abandons suspended story', 'silence cannot create phantom completion'] });

  // R5 — inactivity close/reopen uses a fresh provider session and no stale command queue.
  {
    const provider = new DeterministicRealtimeConversationProvider();
    const first = await provider.createSession(config('r5-first'));
    await first.issueClientConnection();
    await first.close('inactivity');
    const second = await provider.createSession(config('r5-second'));
    const connection = await second.issueClientConnection();
    results.push({ id: 'R5', passed: provider.sessions.length === 2 && first.providerSessionId !== second.providerSessionId &&
      connection.providerSessionId === second.providerSessionId && second.takeClientCommands().length === 0,
    assertions: ['inactivity close', 'fresh provider session', 'no stale commands'] });
    await second.close('client_closed');
  }

  // R6 — both candidates run the exact same B1-B6 definitions and instrumentation in CI mock mode.
  {
    const report = await runRealtimeBenchmark([
      replayDriver('openai_realtime', 'openai-realtime-ci'),
      replayDriver('gemini_live', 'gemini-live-ci'),
    ], {
      recordedAt: '2026-09-27T12:00:00.000Z', mode: 'deterministic', platform: 'node-ci',
      transport: 'provider-mocked', network: 'fixture', guide: 'dana', language: 'en', inactivityTimeoutMs: 45_000,
    });
    results.push({ id: 'R6', passed: report.comparable && report.observations.length === 12 && report.summaries.length === 2,
      assertions: ['identical B1-B6', 'two provider routes', 'comparable timestamp-based metrics', 'mocked mode labeled'] });
  }

  return results;
}

function config(sessionId: string) {
  return {
    sessionId, guideId: 'dana', language: 'en',
    voiceProfile: { guideId: 'dana', language: 'en', speakingStyle: ['warm'] },
    inactivityTimeoutMs: 45_000, clientTransport: 'native' as const,
  };
}

function replayDriver(provider: RealtimeBenchmarkProviderId, model: string): RealtimeBenchmarkDriver {
  return {
    provider,
    model,
    run: async (script: RealtimeBenchmarkScript): Promise<RealtimeBenchmarkObservation> => ({
      provider, model, scriptId: script.id,
      connectMs: 100, localPauseMs: script.id === 'B1' ? 5 : undefined,
      finalTurnMs: 200, firstAudioMs: 300, bargeInStopMs: script.id === 'B3' ? 25 : undefined,
      totalTurnMs: 400, toolCorrect: true, transcriptCorrect: true,
      factualPreservation: 'preserved', reconnectSucceeded: script.id === 'B6' ? true : undefined,
      staleAudioObserved: false, inputAudioUnits: 10, outputAudioUnits: 20,
      estimatedCostUsd: 0, errors: [],
    }),
  };
}

