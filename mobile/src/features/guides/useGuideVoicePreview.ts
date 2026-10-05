import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import type { GuidePreference, SupportedLocale } from '../../localization/preferences';
import { requestGuideVoiceSample } from '../../api/voiceSample';
import { resolveVoiceSampleUrl } from './voiceSampleUrl';
import { config } from '../../config';
import {
  GuideVoicePreviewController,
  type GuideVoicePreviewSnapshot,
} from './guideVoicePreviewController';

export type GuideVoicePreviewState = GuideVoicePreviewSnapshot['state'];

export function useGuideVoicePreview(params: {
  language: SupportedLocale;
  guestId?: string;
}) {
  const contextRef = useRef(params);
  contextRef.current = params;

  const controllerRef = useRef<GuideVoicePreviewController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new GuideVoicePreviewController(params, {
      requestSample: requestGuideVoiceSample,
      resolveUrl: (audioUrl) => resolveVoiceSampleUrl(audioUrl, config.apiBase),
      probe: async (url) => {
        let response: Response;
        try {
          response = await fetch(url, { method: 'HEAD' });
        } catch {
          throw new Error('Voice sample audio is not reachable from this device.');
        }
        if (!response.ok) throw new Error(`Voice sample audio is unavailable (HTTP ${response.status}).`);
      },
      configureAudio: () =>
        Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        }),
      createSound: async (url, onFinished) => {
        let nativeSound: Audio.Sound | null = null;
        const created = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          (status: AVPlaybackStatus) => {
            if (status.isLoaded && status.didJustFinish) onFinished();
          },
        );
        nativeSound = created.sound;
        return {
          stop: () => nativeSound!.stopAsync().then(() => undefined),
          unload: () => nativeSound!.unloadAsync().then(() => undefined),
        };
      },
    });
  }

  const controller = controllerRef.current;
  controller.updateContext(contextRef.current);

  const [snapshot, setSnapshot] = useState<GuideVoicePreviewSnapshot>(() => controller.getSnapshot());

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => () => {
    void controller.dispose();
  }, [controller]);

  const play = useCallback((guideId: GuidePreference) => controller.play(guideId), [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  const retry = useCallback(() => controller.retry(), [controller]);

  return {
    state: snapshot.state,
    error: snapshot.error,
    activeGuideId: snapshot.activeGuideId,
    play,
    stop,
    retry,
  };
}
