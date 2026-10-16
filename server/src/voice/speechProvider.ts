import type { SpeechProvider, SpeechSynthesisRequest, SpeechSynthesisResult } from './contracts';

export type SpeechSynthesizer = (request: SpeechSynthesisRequest) => Promise<string | Uint8Array>;

/** Adapts the existing quality TTS implementation without coupling it to realtime transport. */
export class OpenAISpeechProvider implements SpeechProvider {
  readonly id = 'openai_tts';

  constructor(private readonly model: string, private readonly synthesizeExisting: SpeechSynthesizer) {}

  async synthesize(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
    const started = Date.now();
    request.signal?.throwIfAborted();
    const output = await this.synthesizeExisting(request);
    request.signal?.throwIfAborted();
    return {
      ...(typeof output === 'string' ? { audioUrl: output } : { audioBytes: output }),
      providerId: this.id,
      model: this.model,
      latencyMs: Date.now() - started,
    };
  }
}

