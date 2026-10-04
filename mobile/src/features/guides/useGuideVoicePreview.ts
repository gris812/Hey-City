import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import type { GuidePreference, SupportedLocale } from '../../localization/preferences';
import { requestGuideVoiceSample } from '../../api/voiceSample';
import { resolveVoiceSampleUrl } from './voiceSampleUrl';
import { config } from '../../config';

export type GuideVoicePreviewState = 'idle' | 'loading' | 'playing' | 'error';

export function useGuideVoicePreview(params: {
  language: SupportedLocale;
  guestId?: string;
}) {
  const [state, setState] = useState<GuideVoicePreviewState>('idle');
  const [error, setError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const activeGuideRef = useRef<GuidePreference | null>(null);
  const generationRef = useRef(0);

  const stop = useCallback(async () => {
    generationRef.current += 1;
    activeGuideRef.current = null;
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      await sound.stopAsync().catch(() => {});
      await sound.unloadAsync().catch(() => {});
    }
    setState('idle');
    setError(null);
  }, []);

  const play = useCallback(async (guideId: GuidePreference) => {
    const generation = ++generationRef.current;
    activeGuideRef.current = guideId;
    setState('loading');
    setError(null);

    const oldSound = soundRef.current;
    soundRef.current = null;
    if (oldSound) await oldSound.unloadAsync().catch(() => {});

    try {
      const sample = await requestGuideVoiceSample(
        guideId,
        params.language === 'ru' ? 'ru' : 'en',
        params.guestId,
      );
      if (generation !== generationRef.current) return;

      const audioUrl = resolveVoiceSampleUrl(sample.audioUrl, config.apiBase);
      let mediaProbe: Response;
      try {
        mediaProbe = await fetch(audioUrl, { method: 'HEAD' });
      } catch {
        throw new Error('Voice sample audio is not reachable from this device.');
      }
      if (!mediaProbe.ok) {
        throw new Error(`Voice sample audio is unavailable (HTTP ${mediaProbe.status}).`);
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      if (generation !== generationRef.current) return;

      let createdSound: Audio.Sound | null = null;
      const created = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
        (status: AVPlaybackStatus) => {
          if (generation !== generationRef.current || !status.isLoaded) return;
          if (status.didJustFinish) {
            const finished = createdSound;
            soundRef.current = null;
            activeGuideRef.current = null;
            setState('idle');
            if (finished) void finished.unloadAsync().catch(() => {});
          }
        },
      );
      createdSound = created.sound;
      if (generation !== generationRef.current) {
        await created.sound.unloadAsync().catch(() => {});
        return;
      }
      soundRef.current = created.sound;
      setState('playing');
    } catch (cause) {
      if (generation !== generationRef.current) return;
      activeGuideRef.current = guideId;
      setError(cause instanceof Error ? cause.message : 'Voice sample could not be played.');
      setState('error');
    }
  }, [params.guestId, params.language]);

  useEffect(() => () => {
    generationRef.current += 1;
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) void sound.unloadAsync().catch(() => {});
  }, []);

  return {
    state,
    error,
    activeGuideId: activeGuideRef.current,
    play,
    stop,
    retry: async () => {
      const guideId = activeGuideRef.current;
      if (guideId) await play(guideId);
    },
  };
}
