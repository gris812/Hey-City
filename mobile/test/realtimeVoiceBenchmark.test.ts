import assert from 'node:assert/strict';
import {
  M4NativeBenchmarkRecorder,
  benchmarkMarkdown,
  calculateMetrics,
  classifyFactualPreservation,
} from '../src/features/live/realtimeVoiceBenchmark';
import type { RealtimeVoiceBenchmarkEvent } from '../src/features/live/realtimeVoice';

const event = (name: RealtimeVoiceBenchmarkEvent['name'], atMonotonicMs: number, extra: Partial<RealtimeVoiceBenchmarkEvent> = {}): RealtimeVoiceBenchmarkEvent => ({
  name, atMonotonicMs, generation: 1, ...extra,
});

function run(): void {
  const events = [
    event('talk_tap', 10), event('local_story_paused', 18),
    event('realtime_connect_start', 20), event('realtime_ready', 120),
    event('speech_end', 200), event('final_turn_received', 240),
    event('m3_answer_ready', 320), event('first_audio', 410),
    event('barge_in_detected', 500), event('old_output_stopped', 526),
  ];
  assert.deepEqual(calculateMetrics(events), {
    localPauseLatencyMs: 8,
    connectLatencyMs: 100,
    speechEndToFinalTurnMs: 40,
    speechEndToM3AnswerMs: 120,
    speechEndToFirstAudioMs: 210,
    m3AnswerToFirstAudioMs: 90,
    bargeInStopLatencyMs: 26,
  });
  assert.equal(classifyFactualPreservation('Federal Hall hosted Congress.', 'Federal Hall hosted Congress!'), 'near-verbatim');
  assert.equal(classifyFactualPreservation('Federal Hall hosted the first Congress.', ''), 'omission');

  const recorder = new M4NativeBenchmarkRecorder({
    mode: 'live_native', device: 'iPhone fixture', os: 'iOS fixture', appBuild: '1 (1)',
    gitSha: 'fixture', network: 'wifi', fixture: 'm4-road-noise-v1-generated',
  }, new Date('2026-09-30T00:00:00.000Z'));
  recorder.beginTrial({ scenario: 'B1', repetition: 1, provider: 'openai', guide: 'dana', language: 'en' });
  for (const item of events) recorder.record(item);
  recorder.record(event('m3_answer_ready', 320, { text: 'Approved answer.' }));
  recorder.record(event('provider_output_transcript', 400, { text: 'Approved answer.' }));
  recorder.record(event('response_complete', 450, {
    providerId: 'openai', model: 'gpt-realtime',
    usage: { providerId: 'openai', voiceTurnId: 'voice-1', inputAudioTokens: 12, outputAudioTokens: 8 },
  }));
  const trial = recorder.finishTrial({ factualComparison: 'exact' });
  assert.equal(trial?.approvedM3AnswerText, 'Approved answer.');
  assert.equal(trial?.providerOutputTranscript, 'Approved answer.');
  assert.equal(trial?.usage?.outputAudioTokens, 8);
  assert.equal(recorder.artifact.privacy.productionTelemetryChanged, false);
  const markdown = benchmarkMarkdown(recorder.artifact);
  assert.match(markdown, /B5 human scoring/);
  assert.match(markdown, /Latency and subjective scores are intentionally reported separately/);
  console.log('M4 native benchmark artifact and latency calculations passed');
}

run();
