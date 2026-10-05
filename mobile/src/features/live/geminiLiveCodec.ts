import type { RealtimeClientCommand, RealtimeVoiceUsageReport } from '@heycity/shared';
import type { RealtimeClientEvent } from './realtimeVoice';

export type GeminiLiveDecodedItem =
  | { type: 'setup_complete' }
  | { type: 'audio'; base64: string; sampleRate: number }
  | { type: 'client_event'; event: RealtimeClientEvent };

type JsonRecord = Record<string, unknown>;

/** Pure Gemini wire codec. Audio capture/playout remains in the native transport. */
export class GeminiLiveCodec {
  private providerId = 'gemini';
  private generation = 0;
  private inputTranscript = '';
  private outputTranscript = '';
  private inputStartedAt = '';
  private voiceTurnId = '';
  private renderingGroundedAnswer = false;
  private responseStarted = false;
  private inputAudioBytes = 0;
  private outputAudioBytes = 0;
  private latestUsageMetadata?: JsonRecord;

  configure(input: { providerId: string; generation: number }): void {
    this.providerId = input.providerId;
    this.generation = input.generation;
  }

  beginInputSpeech(at = new Date().toISOString()): void {
    if (!this.inputStartedAt) this.inputStartedAt = at;
  }

  registerInputAudioBytes(bytes: number): void {
    this.inputAudioBytes += Math.max(0, Math.floor(bytes));
  }

  encodeCommand(command: RealtimeClientCommand): JsonRecord | undefined {
    if (command.type === 'close') return undefined;
    if (command.type === 'cancel_response') {
      this.renderingGroundedAnswer = false;
      this.responseStarted = false;
      this.outputTranscript = '';
      return { realtimeInput: { activityStart: {} } };
    }
    this.renderingGroundedAnswer = true;
    this.responseStarted = false;
    this.voiceTurnId = command.voiceTurnId;
    this.outputTranscript = '';
    this.outputAudioBytes = 0;
    return {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text: exactRenderingPrompt(command.text, command.renderingInstructions) }],
        }],
        turnComplete: true,
      },
    };
  }

  decode(payload: string): GeminiLiveDecodedItem[] {
    let message: JsonRecord;
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (!parsed || typeof parsed !== 'object') return [];
      message = parsed as JsonRecord;
    } catch {
      return [{ type: 'client_event', event: { type: 'error', code: 'gemini_invalid_json' } }];
    }
    const items: GeminiLiveDecodedItem[] = [];
    const usageMetadata = record(message.usageMetadata);
    if (usageMetadata) this.latestUsageMetadata = usageMetadata;
    if (message.setupComplete) items.push({ type: 'setup_complete' });
    const content = record(message.serverContent);
    if (content) {
      const interim = textOf(record(content.interimInputTranscription));
      const input = textOf(record(content.inputTranscription));
      if ((interim || input) && !this.renderingGroundedAnswer) {
        const firstSpeechSignal = !this.inputStartedAt;
        this.beginInputSpeech();
        if (firstSpeechSignal) items.push({ type: 'client_event', event: { type: 'speech_started' } });
        if (input) this.inputTranscript = mergeTranscript(this.inputTranscript, input);
        else if (interim) this.inputTranscript = mergeTranscript(this.inputTranscript, interim);
      }

      const modelTurn = record(content.modelTurn);
      const parts = Array.isArray(modelTurn?.parts) ? modelTurn.parts : [];
      for (const partValue of parts) {
        const inlineData = record(record(partValue)?.inlineData);
        const data = typeof inlineData?.data === 'string' ? inlineData.data : '';
        if (!data || !this.renderingGroundedAnswer) continue;
        const sampleRate = parseSampleRate(typeof inlineData?.mimeType === 'string' ? inlineData.mimeType : '');
        this.outputAudioBytes += base64ByteLength(data);
        if (!this.responseStarted) {
          this.responseStarted = true;
          items.push({
            type: 'client_event',
            event: { type: 'response_started', generation: this.generation, voiceTurnId: this.voiceTurnId },
          });
        }
        items.push({ type: 'audio', base64: data, sampleRate });
      }

      const output = textOf(record(content.outputTranscription));
      if (output && this.renderingGroundedAnswer) {
        this.outputTranscript = mergeTranscript(this.outputTranscript, output);
        items.push({
          type: 'client_event',
          event: {
            type: 'output_transcript', generation: this.generation,
            voiceTurnId: this.voiceTurnId, text: this.outputTranscript, isFinal: false,
          },
        });
      }

      if (content.interrupted === true && this.renderingGroundedAnswer) {
        this.renderingGroundedAnswer = false;
        this.responseStarted = false;
      }
      if (content.turnComplete === true) {
        if (this.renderingGroundedAnswer) {
          if (this.outputTranscript) {
            items.push({
              type: 'client_event',
              event: {
                type: 'output_transcript', generation: this.generation,
                voiceTurnId: this.voiceTurnId, text: this.outputTranscript, isFinal: true,
              },
            });
          }
          items.push({
            type: 'client_event',
            event: {
              type: 'response_completed', generation: this.generation, voiceTurnId: this.voiceTurnId,
              usage: this.usage(message, this.voiceTurnId),
            },
          });
          this.renderingGroundedAnswer = false;
          this.responseStarted = false;
          this.outputTranscript = '';
          this.inputAudioBytes = 0;
          this.outputAudioBytes = 0;
          this.latestUsageMetadata = undefined;
        } else if (this.inputTranscript.trim()) {
          const voiceTurnId = `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          items.push({
            type: 'client_event',
            event: {
              type: 'user_turn',
              turn: {
                voiceTurnId,
                text: this.inputTranscript.trim(),
                isFinal: true,
                startedAt: this.inputStartedAt || new Date().toISOString(),
                endedAt: new Date().toISOString(),
                providerId: this.providerId,
              },
            },
          });
          this.inputTranscript = '';
          this.inputStartedAt = '';
        }
      }
    }
    return items;
  }

  private usage(message: JsonRecord, voiceTurnId: string): Omit<RealtimeVoiceUsageReport, 'generation'> {
    const metadata = record(message.usageMetadata) ?? this.latestUsageMetadata;
    const inputDetails = tokenDetails(metadata?.promptTokensDetails);
    const outputDetails = tokenDetails(metadata?.responseTokensDetails);
    return {
      providerId: this.providerId,
      voiceTurnId,
      inputTextTokens: inputDetails.text,
      inputAudioTokens: inputDetails.audio,
      outputTextTokens: outputDetails.text,
      outputAudioTokens: outputDetails.audio,
      inputAudioBytes: this.inputAudioBytes,
      outputAudioBytes: this.outputAudioBytes,
    };
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

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' ? value as JsonRecord : undefined;
}

function textOf(value: JsonRecord | undefined): string {
  return typeof value?.text === 'string' ? value.text.trim() : '';
}

function mergeTranscript(current: string, next: string): string {
  const clean = next.trim();
  if (!clean) return current;
  if (!current || clean.startsWith(current)) return clean;
  if (current.endsWith(clean)) return current;
  return `${current} ${clean}`.trim();
}

function parseSampleRate(mimeType: string): number {
  const match = /rate=(\d+)/i.exec(mimeType);
  const rate = Number(match?.[1]);
  return Number.isFinite(rate) && rate >= 8_000 && rate <= 96_000 ? rate : 24_000;
}

function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}

function tokenDetails(value: unknown): { text: number; audio: number } {
  const result = { text: 0, audio: 0 };
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    const detail = record(item);
    const modality = typeof detail?.modality === 'string' ? detail.modality.toLowerCase() : '';
    const count = typeof detail?.tokenCount === 'number' && Number.isFinite(detail.tokenCount)
      ? Math.max(0, Math.floor(detail.tokenCount)) : 0;
    if (modality === 'audio') result.audio += count;
    if (modality === 'text') result.text += count;
  }
  return result;
}
