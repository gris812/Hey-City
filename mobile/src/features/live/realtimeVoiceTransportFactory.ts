import type { RealtimeVoiceTransport } from './realtimeVoice';
import { NativeWebRtcVoiceTransport } from './nativeWebRtcVoiceTransport';
import { OpenAIRealtimeCodec } from './openAIRealtimeCodec';
import { NativeGeminiVoiceTransport } from './nativeGeminiVoiceTransport';

export type NativeBenchmarkProvider = 'openai' | 'gemini';

/** The only provider-specific mobile selection point. Product lifecycle/UI remain neutral. */
export function createNativeRealtimeVoiceTransport(
  benchmarkProvider?: NativeBenchmarkProvider,
): RealtimeVoiceTransport {
  if (benchmarkProvider === 'gemini') return new NativeGeminiVoiceTransport();
  return new NativeWebRtcVoiceTransport(new OpenAIRealtimeCodec());
}
