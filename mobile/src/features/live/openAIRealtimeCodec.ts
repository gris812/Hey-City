import type { RealtimeClientCommand, RealtimeVoiceUsageReport } from '@heycity/shared';
import type { NativeRealtimeEventCodec } from './nativeWebRtcVoiceTransport';
import type { RealtimeClientEvent } from './realtimeVoice';

/** OpenAI wire events stay in this adapter and never enter product telemetry. */
export class OpenAIRealtimeCodec implements NativeRealtimeEventCodec {
  private generation = 0;
  private providerId = 'openai';
  private activeVoiceTurnId?: string;
  private turnStartedAt?: string;
  private turnEndedAtMs?: number;
  private firstAudioLatencyMs?: number;

  constructor(private readonly now: () => number = Date.now) {}

  configure(input: { providerId: string; generation: number }): void {
    this.providerId = input.providerId;
    this.generation = input.generation;
  }

  decode(payload: string): RealtimeClientEvent | null {
    let event: Record<string, unknown>;
    try { event = JSON.parse(payload) as Record<string, unknown>; }
    catch { return null; }
    const type = typeof event.type === 'string' ? event.type : '';
    if (type === 'input_audio_buffer.speech_started') {
      this.turnStartedAt = new Date().toISOString();
      return { type: 'speech_started' };
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const text = typeof event.transcript === 'string' ? event.transcript.trim() : '';
      if (!text) return null;
      this.activeVoiceTurnId = typeof event.item_id === 'string' ? event.item_id : `voice-${Date.now()}`;
      this.turnEndedAtMs = this.now();
      this.firstAudioLatencyMs = undefined;
      return {
        type: 'user_turn',
        turn: {
          voiceTurnId: this.activeVoiceTurnId,
          text,
          isFinal: true,
          startedAt: this.turnStartedAt ?? new Date().toISOString(),
          endedAt: new Date().toISOString(),
          providerId: this.providerId,
        },
      };
    }
    if (type === 'response.created' && this.activeVoiceTurnId) {
      return { type: 'response_started', generation: this.generation, voiceTurnId: this.activeVoiceTurnId };
    }
    if ((type === 'response.output_audio.delta' || type === 'response.audio.delta') && this.turnEndedAtMs !== undefined) {
      this.firstAudioLatencyMs ??= Math.max(0, this.now() - this.turnEndedAtMs);
      return null;
    }
    if (type === 'response.done' && this.activeVoiceTurnId) {
      const voiceTurnId = this.activeVoiceTurnId;
      return {
        type: 'response_completed',
        generation: this.generation,
        voiceTurnId,
        usage: parseUsage(event, this.providerId, voiceTurnId, this.firstAudioLatencyMs),
      };
    }
    if (type === 'error') return { type: 'error', code: 'provider_event_error' };
    return null;
  }

  encodeCommand(command: RealtimeClientCommand): string | string[] | undefined {
    if (command.type === 'close') return undefined;
    if (command.type === 'cancel_response') {
      return [JSON.stringify({ type: 'response.cancel' }), JSON.stringify({ type: 'output_audio_buffer.clear' })];
    }
    this.activeVoiceTurnId = command.voiceTurnId;
    return JSON.stringify({
      type: 'response.create',
      event_id: `answer_${command.voiceTurnId}`,
      response: {
        output_modalities: ['audio'],
        instructions: exactRenderingPrompt(command.text, command.renderingInstructions),
      },
    });
  }
}

function exactRenderingPrompt(text: string, instructions: string): string {
  return [
    instructions.slice(0, 500),
    'Render only the exact text between the markers. Do not speak the markers.',
    '<HEY_CITY_APPROVED_TEXT>',
    text.slice(0, 4_000),
    '</HEY_CITY_APPROVED_TEXT>',
  ].join('\n');
}

function parseUsage(
  event: Record<string, unknown>,
  providerId: string,
  voiceTurnId: string,
  firstAudioLatencyMs?: number,
): Omit<RealtimeVoiceUsageReport, 'generation'> | undefined {
  const response = objectValue(event.response);
  const usage = objectValue(response?.usage);
  if (!usage) return undefined;
  const inputDetails = objectValue(usage.input_token_details);
  const outputDetails = objectValue(usage.output_token_details);
  return {
    providerId,
    voiceTurnId,
    ...(firstAudioLatencyMs === undefined ? {} : { firstAudioLatencyMs: boundedNumber(firstAudioLatencyMs) }),
    inputTextTokens: boundedNumber(inputDetails?.text_tokens),
    outputTextTokens: boundedNumber(outputDetails?.text_tokens),
    inputAudioTokens: boundedNumber(inputDetails?.audio_tokens),
    outputAudioTokens: boundedNumber(outputDetails?.audio_tokens),
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function boundedNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(Math.round(value), 100_000_000)
    : undefined;
}
