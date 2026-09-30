import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStream,
} from 'react-native-webrtc';
import type { RealtimeClientCommand, RealtimeClientConnection } from '@heycity/shared';
import type {
  RealtimeClientEvent,
  RealtimeVoiceTransport,
  Unsubscribe,
} from './realtimeVoice';

/** Provider-specific data-channel payloads are isolated in a codec, not UI/session code. */
export interface NativeRealtimeEventCodec {
  decode(payload: string): RealtimeClientEvent | null;
  encodeCommand(command: RealtimeClientCommand): string | string[] | undefined;
  configure?(input: { providerId: string; generation: number }): void;
}

/**
 * Native WebRTC requires an Expo development/native build. react-native-webrtc
 * cannot be loaded by Expo Go; see REALTIME_VOICE.md.
 */
export class NativeWebRtcVoiceTransport implements RealtimeVoiceTransport {
  readonly kind = 'native' as const;
  private readonly codec: NativeRealtimeEventCodec;
  private peer?: RTCPeerConnection;
  private stream?: MediaStream;
  private channel?: ReturnType<RTCPeerConnection['createDataChannel']>;
  private handlers = new Set<(event: RealtimeClientEvent) => void>();

  constructor(codec: NativeRealtimeEventCodec) {
    this.codec = codec;
  }

  async createClientOffer(): Promise<string> {
    this.peer = new RTCPeerConnection();
    this.stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    for (const track of this.stream.getTracks()) {
      track.enabled = false;
      this.peer.addTrack(track, this.stream);
    }
    this.channel = this.peer.createDataChannel('hey-city-realtime-events');
    this.channel.onmessage = (event: { data?: unknown }) => {
      if (typeof event.data !== 'string') return;
      const normalized = this.codec.decode(event.data);
      if (normalized) this.emit(normalized);
    };
    const offer = await this.peer.createOffer({ offerToReceiveAudio: true });
    await this.peer.setLocalDescription(offer);
    return offer.sdp ?? '';
  }

  async connect(connection: RealtimeClientConnection): Promise<void> {
    if (!this.peer || connection.connection.kind !== 'webrtc_answer') throw new Error('native_webrtc_answer_missing');
    await this.peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: connection.connection.answerSdp }));
  }

  configureSession(input: { providerId: string; generation: number }): void {
    this.codec.configure?.(input);
  }

  async startCapture(): Promise<void> {
    if (!this.stream) throw new Error('microphone_not_ready');
    for (const track of this.stream.getAudioTracks()) track.enabled = true;
  }

  async stopCapture(): Promise<void> {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = false;
  }

  async interruptOutput(): Promise<void> {
    for (const receiver of this.peer?.getReceivers() ?? []) {
      if (receiver.track) receiver.track.enabled = false;
    }
    this.sendEncoded(this.codec.encodeCommand({ type: 'cancel_response' }));
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
      if (!payload || this.channel?.readyState !== 'open') throw new Error('realtime_data_channel_not_ready');
      this.sendEncoded(payload);
    }
  }

  async close(): Promise<void> {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = undefined;
    this.channel?.close();
    this.channel = undefined;
    this.peer?.close();
    this.peer = undefined;
    this.handlers.clear();
  }

  onEvent(handler: (event: RealtimeClientEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: RealtimeClientEvent): void {
    if (event.type === 'response_started') {
      for (const receiver of this.peer?.getReceivers() ?? []) {
        if (receiver.track) receiver.track.enabled = true;
      }
    }
    for (const handler of this.handlers) handler(event);
  }

  private sendEncoded(payload: string | string[] | undefined): void {
    if (!payload || this.channel?.readyState !== 'open') return;
    for (const item of Array.isArray(payload) ? payload : [payload]) this.channel.send(item);
  }
}
