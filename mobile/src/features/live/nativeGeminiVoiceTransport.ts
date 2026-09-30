import { AudioContext, type AudioBufferQueueSourceNode } from 'react-native-audio-api';
import { AudioStudioModule } from '@siteed/audio-studio';
import { toByteArray } from 'base64-js';
import type { RealtimeClientCommand, RealtimeClientConnection } from '@heycity/shared';
import { GeminiLiveCodec } from './geminiLiveCodec';
import type { RealtimeClientEvent, RealtimeVoiceTransport, Unsubscribe } from './realtimeVoice';

type AudioSubscription = { remove(): void };
type AudioDataPayload = {
  encoded?: string;
  deltaSize?: number;
};

/** Gemini Live native adapter: short-lived WebSocket auth plus PCM16 capture/playout. */
export class NativeGeminiVoiceTransport implements RealtimeVoiceTransport {
  readonly kind = 'native' as const;
  private readonly codec = new GeminiLiveCodec();
  private socket?: WebSocket;
  private audioSubscription?: AudioSubscription;
  private handlers = new Set<(event: RealtimeClientEvent) => void>();
  private setupResolve?: () => void;
  private setupReject?: (error: Error) => void;
  private intentionalClose = false;
  private captureStarted = false;
  private outputContext?: AudioContext;
  private outputQueue?: AudioBufferQueueSourceNode;
  private outputQueueStarted = false;
  private activeResponse?: { generation: number; voiceTurnId: string; firstAudioEmitted: boolean };
  private localSpeechActive = false;
  private quietChunkCount = 0;

  configureSession(input: { providerId: string; generation: number }): void {
    this.codec.configure(input);
  }

  async connect(connection: RealtimeClientConnection): Promise<void> {
    if (connection.connection.kind !== 'websocket_ephemeral') throw new Error('gemini_websocket_connection_missing');
    this.intentionalClose = false;
    const separator = connection.connection.url.includes('?') ? '&' : '?';
    const authenticatedUrl = `${connection.connection.url}${separator}access_token=${encodeURIComponent(connection.connection.token)}`;
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(authenticatedUrl);
      this.socket = socket;
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('gemini_setup_timeout'));
        socket.close();
      }, 12_000);
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      this.setupResolve = () => finish(resolve);
      this.setupReject = error => finish(() => reject(error));
      socket.onopen = () => socket.send(JSON.stringify({ setup: {} }));
      socket.onmessage = event => {
        if (typeof event.data === 'string') void this.handleMessage(event.data);
      };
      socket.onerror = () => this.setupReject?.(new Error('gemini_websocket_error'));
      socket.onclose = () => {
        this.setupReject?.(new Error('gemini_websocket_closed_before_ready'));
        if (!this.intentionalClose) this.emit({ type: 'closed' });
      };
    });
  }

  async startCapture(): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('gemini_websocket_not_ready');
    const existing = await AudioStudioModule.getPermissionsAsync();
    const permission = existing?.granted ? existing : await AudioStudioModule.requestPermissionsAsync();
    if (!permission?.granted) throw new Error('microphone_permission_denied');
    this.audioSubscription?.remove();
    this.audioSubscription = AudioStudioModule.addListener('AudioData', (payload: AudioDataPayload) => {
      const encoded = typeof payload.encoded === 'string' ? payload.encoded : '';
      if (!encoded || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      this.observeLocalSpeech(encoded);
      this.codec.registerInputAudioBytes(
        typeof payload.deltaSize === 'number' ? payload.deltaSize : base64ByteLength(encoded),
      );
      this.socket.send(JSON.stringify({
        realtimeInput: { audio: { data: encoded, mimeType: 'audio/pcm;rate=16000' } },
      }));
    }) as AudioSubscription;
    await AudioStudioModule.startRecording({
      sampleRate: 16_000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 100,
      bufferDurationSeconds: 0.1,
      enableProcessing: false,
      keepAwake: true,
      ios: {
        audioSession: {
          category: 'PlayAndRecord',
          mode: 'VoiceChat',
          categoryOptions: ['AllowBluetooth', 'DefaultToSpeaker'],
        },
      },
      android: { audioFocusStrategy: 'communication' },
      output: { primary: { enabled: false }, compressed: { enabled: false } },
    });
    this.captureStarted = true;
  }

  async stopCapture(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
    this.audioSubscription?.remove();
    this.audioSubscription = undefined;
    if (this.captureStarted) await AudioStudioModule.stopRecording().catch(() => undefined);
    this.captureStarted = false;
    if (this.localSpeechActive) this.emit({ type: 'speech_ended' });
    this.localSpeechActive = false;
    this.quietChunkCount = 0;
  }

  async interruptOutput(): Promise<void> {
    this.clearOutputQueue();
    const payload = this.codec.encodeCommand({ type: 'cancel_response' });
    this.send(payload);
  }

  async applyCommands(commands: RealtimeClientCommand[]): Promise<void> {
    for (const command of commands) {
      if (command.type === 'cancel_response') {
        await this.interruptOutput();
        continue;
      }
      if (command.type === 'close') {
        await this.close();
        continue;
      }
      const payload = this.codec.encodeCommand(command);
      if (!payload) continue;
      this.activeResponse = {
        generation: command.type === 'speak_grounded_answer' ? this.currentGeneration() : 0,
        voiceTurnId: command.type === 'speak_grounded_answer' ? command.voiceTurnId : '',
        firstAudioEmitted: false,
      };
      this.send(payload);
    }
  }

  async close(): Promise<void> {
    this.intentionalClose = true;
    await this.stopCapture().catch(() => undefined);
    this.clearOutputQueue();
    await this.outputContext?.close().catch(() => undefined);
    this.outputContext = undefined;
    this.socket?.close();
    this.socket = undefined;
    this.setupResolve = undefined;
    this.setupReject = undefined;
    this.handlers.clear();
  }

  onEvent(handler: (event: RealtimeClientEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private async handleMessage(payload: string): Promise<void> {
    for (const item of this.codec.decode(payload)) {
      if (item.type === 'setup_complete') {
        this.setupResolve?.();
        this.setupResolve = undefined;
        this.setupReject = undefined;
        this.emit({ type: 'state', state: 'ready' });
        continue;
      }
      if (item.type === 'audio') {
        await this.enqueueAudio(item.base64, item.sampleRate);
        continue;
      }
      if (item.event.type === 'response_started') {
        this.activeResponse = {
          generation: item.event.generation,
          voiceTurnId: item.event.voiceTurnId,
          firstAudioEmitted: false,
        };
      }
      this.emit(item.event);
    }
  }

  private async enqueueAudio(base64: string, sampleRate: number): Promise<void> {
    const context = this.outputContext ??= new AudioContext();
    await context.resume();
    const queue = this.outputQueue ??= this.createOutputQueue(context);
    const buffer = await context.decodePCMInBase64(base64, sampleRate, 1, true);
    queue.enqueueBuffer(buffer);
    if (!this.outputQueueStarted) {
      queue.start();
      this.outputQueueStarted = true;
    }
    if (this.activeResponse && !this.activeResponse.firstAudioEmitted) {
      this.activeResponse.firstAudioEmitted = true;
      this.emit({
        type: 'response_audio_started',
        generation: this.activeResponse.generation,
        voiceTurnId: this.activeResponse.voiceTurnId,
      });
    }
  }

  private createOutputQueue(context: AudioContext): AudioBufferQueueSourceNode {
    const queue = context.createBufferQueueSource();
    queue.connect(context.destination);
    return queue;
  }

  private clearOutputQueue(): void {
    try { this.outputQueue?.clearBuffers(); } catch { /* native queue may already be stopped */ }
    try { this.outputQueue?.stop(); } catch { /* idempotent cleanup */ }
    this.outputQueue = undefined;
    this.outputQueueStarted = false;
    this.activeResponse = undefined;
  }

  private send(payload: Record<string, unknown> | undefined): void {
    if (!payload || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('gemini_websocket_not_ready');
    }
    this.socket.send(JSON.stringify(payload));
  }

  private emit(event: RealtimeClientEvent): void {
    for (const handler of this.handlers) handler(event);
  }

  private observeLocalSpeech(encodedPcm16: string): void {
    const rms = pcm16Rms(encodedPcm16);
    if (!this.localSpeechActive && rms >= 0.025) {
      this.localSpeechActive = true;
      this.quietChunkCount = 0;
      this.codec.beginInputSpeech();
      this.emit({ type: 'speech_started' });
      return;
    }
    if (!this.localSpeechActive) return;
    if (rms < 0.018) this.quietChunkCount += 1;
    else this.quietChunkCount = 0;
    if (this.quietChunkCount >= 6) {
      this.localSpeechActive = false;
      this.quietChunkCount = 0;
      this.emit({ type: 'speech_ended' });
    }
  }

  private currentGeneration(): number {
    // The codec supplies the canonical generation in its response_started event.
    return this.activeResponse?.generation ?? 0;
  }
}

function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}

function pcm16Rms(base64: string): number {
  let bytes: Uint8Array;
  try { bytes = toByteArray(base64); }
  catch { return 0; }
  const sampleCount = Math.floor(bytes.length / 2);
  if (!sampleCount) return 0;
  let squares = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const low = bytes[index * 2];
    const high = bytes[index * 2 + 1];
    let sample = (high << 8) | low;
    if (sample >= 0x8000) sample -= 0x10000;
    const normalized = sample / 32768;
    squares += normalized * normalized;
  }
  return Math.sqrt(squares / sampleCount);
}
