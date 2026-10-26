import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import {
  finishDriveStory,
  forceAheadDiscoveryRefresh,
  pingDriveSession,
  startDriveSession,
  stopDriveSession,
  type PingResult,
  type StoryFinishReason,
} from '../../api/drive';
import {
  cancelConversation as cancelConversationRequest,
  interruptConversation,
  resumeConversation as resumeConversationRequest,
  sendConversationTurn as sendConversationTurnRequest,
} from '../../api/conversation';
import type { ConversationTurnResult, MapAction, NavigationAction, ResumeDirective } from '@heycity/shared';
import { getProfile } from '../../api/me';
import { apiConfigurationProblem, config } from '../../config';
import { checkApiCompatibility } from '../../api/health';
import { requestForegroundLocationPermission } from '../../location/permissions';
import {
  guestProfileDefaults,
  shouldLoadProfile,
  type AppIdentityState,
} from '../../context/appIdentity';
import {
  mapDriveSessionToPresentation,
  type PlaybackState,
} from '../../presentation';
import { fromBackendGuideId } from '../../localization/guideIds';
import { resolveVoiceSampleUrl } from '../guides/voiceSampleUrl';
import { gpsSpeedKmh } from './motion';
import type { StoryPlaybackIdentity } from '../../presentation/livePresentation';
import type { GuidePreference, SupportedLocale } from '../../localization/preferences';
import { clearRuntimeInterval } from './runtimeControllerContracts';
import { ConversationPlayback, isCurrentConversationTurn } from './conversationPlayback';
import {
  bargeInRealtimeVoice,
  closeRealtimeVoice,
  connectRealtimeVoice,
  reportRealtimeVoiceUsage,
  requestRealtimeVoiceFallback,
  submitRealtimeVoiceTurn,
} from '../../api/realtimeVoice';
import type { RealtimeVoiceClientSession, RealtimeVoiceClientState } from './realtimeVoice';
import type { NativeBenchmarkProvider } from './realtimeVoiceTransportFactory';
import type {
  M4BenchmarkScenario,
  M4NativeBenchmarkRecorder,
} from './realtimeVoiceBenchmark';

export type DriveMotion = { speedKmh: number | null; heading: number | null };
export type DriveIntervalRef = { current: ReturnType<typeof setInterval> | null };

export function clearDrivePingInterval(
  intervalRef: DriveIntervalRef,
  clearIntervalFn: (id: ReturnType<typeof setInterval>) => void = clearInterval
): void {
  clearRuntimeInterval(intervalRef, clearIntervalFn);
}

export function useDriveDiscoverySession(input: {
  identity: AppIdentityState;
  guideId: GuidePreference;
  guideLanguage: SupportedLocale;
}) {
  const { identity, guideId, guideLanguage } = input;
  const [driveDiscoveryOn, setDriveDiscoveryOn] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themes, setThemes] = useState<string[]>(['mixed']);
  const [style, setStyle] = useState('documentary');
  const [lengthSec, setLengthSec] = useState(90);
  const [leadTimeMin, setLeadTimeMin] = useState(2);
  const [autoplay, setAutoplay] = useState(true);
  const [muted, setMuted] = useState(false);
  const [lastResult, setLastResult] = useState<PingResult | null>(null);
  const [playingName, setPlayingName] = useState<string | null>(null);
  const [playback, setPlayback] = useState<StoryPlaybackIdentity | undefined>();
  const [audioProgress, setAudioProgress] = useState<number | undefined>();
  const [movementMode, setMovementMode] = useState<'walking' | 'vehicle' | undefined>();
  const [localPlaybackState, setLocalPlaybackState] = useState<PlaybackState>('idle');
  const [lastMotion, setLastMotion] = useState<DriveMotion | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [aheadRefreshLoading, setAheadRefreshLoading] = useState(false);
  const [aheadRefreshStatus, setAheadRefreshStatus] = useState<string | null>(null);
  const [conversationResult, setConversationResult] = useState<ConversationTurnResult | null>(null);
  const [conversationMapActions, setConversationMapActions] = useState<MapAction[]>([]);
  const [navigationHandoff, setNavigationHandoff] = useState<NavigationAction | null>(null);
  const [realtimeVoiceState, setRealtimeVoiceState] = useState<RealtimeVoiceClientState>('closed');
  const [locationSettingsRequired, setLocationSettingsRequired] = useState(false);
  const [apiCompatibilityStatus, setApiCompatibilityStatus] = useState<'unknown' | 'compatible' | 'incompatible'>('unknown');
  const [apiBuildSha, setApiBuildSha] = useState<string>('unknown');
  const [realtimeBenchmarkProvider, setRealtimeBenchmarkProvider] = useState<NativeBenchmarkProvider | null>(null);
  const [realtimeBenchmarkScenario, setRealtimeBenchmarkScenario] = useState<M4BenchmarkScenario>('B1');
  const [realtimeBenchmarkExportStatus, setRealtimeBenchmarkExportStatus] = useState<string | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const requestRevisionRef = useRef(0);
  const activeMomentIdRef = useRef<string | null>(null);
  const profileRef = useRef<Awaited<ReturnType<typeof getProfile>> | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const storySoundRef = useRef<Audio.Sound | null>(null);
  const conversationSoundRef = useRef<Audio.Sound | null>(null);
  const benchmarkNoiseSoundRef = useRef<Audio.Sound | null>(null);
  const conversationPlaybackRef = useRef(new ConversationPlayback());
  const conversationTurnRevisionRef = useRef(0);
  const pendingResumeRef = useRef<ResumeDirective | null>(null);
  const realtimeVoiceRef = useRef<RealtimeVoiceClientSession | null>(null);
  const realtimeBenchmarkRecorderRef = useRef<M4NativeBenchmarkRecorder | null>(null);
  const realtimeBenchmarkRepetitionRef = useRef<Record<string, number>>({});
  const guestId = identity.status === 'guest' ? identity.guestId : undefined;

  const startSession = useCallback(async () => {
    if (startingRef.current || activeSessionIdRef.current) return;
    startingRef.current = true;
    setSessionError(null);

    try {
      const configProblem = apiConfigurationProblem();
      if (configProblem) {
        setSessionError(configProblem);
        return;
      }

      const permission = await requestForegroundLocationPermission();
      if (permission !== 'granted') {
        setLocationSettingsRequired(permission === 'restricted');
        setSessionError(permission === 'restricted'
          ? 'Location access is disabled for Hey City. Open iPhone Settings and allow location access.'
          : 'Location permission is required for nearby stories. Please allow location access and try again.');
        return;
      }
      setLocationSettingsRequired(false);

      try {
        const initialLocation = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('location_timeout')), 10_000)),
        ]);
        setDeviceLocation({
          latitude: initialLocation.coords.latitude,
          longitude: initialLocation.coords.longitude,
        });
      } catch {
        setSessionError('Hey City could not get your current location. Check Location Services and try again.');
        return;
      }

      const compatibility = await checkApiCompatibility();
      setApiCompatibilityStatus(compatibility.compatible ? 'compatible' : 'incompatible');
      setApiBuildSha(compatibility.buildSha || 'unknown');
      if (!compatibility.reachable) {
        setSessionError(`Hey City API is unreachable from this iPhone. API: ${config.apiBase}`);
        return;
      }

      const profile = shouldLoadProfile(identity)
        ? profileRef.current ?? (await getProfile())
        : null;
      if (profile) profileRef.current = profile;
      const { sessionId: id } = await startDriveSession({
        mode: 'walking',
        autoMode: true,
        themeTags: themes,
        narrationStyle: style,
        lengthSec,
        leadTimeMin,
        voiceId: profile?.driveDiscovery.voiceId,
        guideId,
        language: guideLanguage,
        autoplay,
        guestId,
      });
      activeSessionIdRef.current = id;
      ++requestRevisionRef.current;
      setSessionId(id);
      setMovementMode('walking');
      setPlayback(undefined);
      activeMomentIdRef.current = null;
      conversationTurnRevisionRef.current += 1;
      setConversationResult(null);
      setConversationMapActions([]);
      setNavigationHandoff(null);
      setDriveDiscoveryOn(true);
      setLocalPlaybackState('idle');
    } catch (e) {
      setSessionError((e as Error).message);
      console.warn('heycity_session_start_failed');
    } finally {
      startingRef.current = false;
    }
  }, [autoplay, guestId, guideId, guideLanguage, identity, leadTimeMin, lengthSec, style, themes]);

  const clearConversationPlayback = useCallback(async () => {
    pendingResumeRef.current = null;
    const conversationSound = conversationSoundRef.current;
    conversationSoundRef.current = null;
    if (conversationSound) await conversationSound.unloadAsync().catch(() => console.warn('native_audio_unload_failed'));
    await conversationPlaybackRef.current.clear().catch(() => console.warn('native_audio_unload_failed'));
    storySoundRef.current = null;
  }, []);

  const reportPlaybackError = useCallback((code: string) => {
    // Deliberately exclude raw exception messages, URLs, GPS and transcript text.
    console.warn(JSON.stringify({ event: 'native_story_error', code }));
    setSessionError(guideLanguage === 'ru'
      ? 'Не удалось воспроизвести рассказ. Попробуйте ещё раз или пропустите его.'
      : 'Story audio could not play. Try again or skip this story.');
  }, [guideLanguage]);

  const stopSession = useCallback(async () => {
    const id = activeSessionIdRef.current;
    if (!id) return;
    activeSessionIdRef.current = null;
    ++requestRevisionRef.current;
    activeMomentIdRef.current = null;
    conversationTurnRevisionRef.current += 1;
    clearDrivePingInterval(pingIntervalRef);
    setSessionId(null);
    setDriveDiscoveryOn(false);
    setLastResult(null);
    setPlayingName(null);
    setPlayback(undefined);
    setMovementMode(undefined);
    setLocalPlaybackState('idle');
    const voice = realtimeVoiceRef.current;
    realtimeVoiceRef.current = null;
    if (voice) await voice.dispose().catch(() => reportPlaybackError('voice_dispose_failed'));
    await clearConversationPlayback().catch(() => reportPlaybackError('audio_unload_failed'));
    await stopDriveSession(id, guestId).catch(() => reportPlaybackError('session_stop_failed'));
  }, [clearConversationPlayback, guestId, reportPlaybackError]);

  const loadStoryPlayback = useCallback(async (story: StoryPlaybackIdentity, audioUrl?: string) => {
    if (activeSessionIdRef.current !== story.sessionId || activeMomentIdRef.current === story.momentId) return;
    activeMomentIdRef.current = story.momentId;
    setPlayback(story);
    setLocalPlaybackState(audioUrl ? 'loading' : 'text_only');
    setAudioProgress(undefined);
    setPlayingName(story.target.name);
    await conversationPlaybackRef.current.loadStory(story, audioUrl ? resolveVoiceSampleUrl(audioUrl, config.apiBase) : undefined, {
      create: async (url, listener) => {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: false }, listener);
        return sound;
      },
      onState: (state, current, progress) => {
        if (activeSessionIdRef.current !== story.sessionId || activeMomentIdRef.current !== story.momentId) return;
        setPlayback(current);
        setLocalPlaybackState(state);
        setAudioProgress(progress);
      },
      onEnded: (ended) => {
        if (activeSessionIdRef.current !== ended.sessionId || activeMomentIdRef.current !== ended.momentId) return;
        activeMomentIdRef.current = null;
        void finishDriveStory(ended.sessionId, 'ended', guestId, ended.momentId)
          .catch(() => reportPlaybackError('completion_report_failed'));
      },
      onError: code => {
        if (activeSessionIdRef.current === story.sessionId && activeMomentIdRef.current === story.momentId) reportPlaybackError(code);
      },
    });
  }, [guestId, reportPlaybackError]);

  useEffect(() => {
    if (!shouldLoadProfile(identity)) {
      profileRef.current = null;
      setThemes(guestProfileDefaults.themeTags);
      setStyle(guestProfileDefaults.narrationStyle);
      setAutoplay(guestProfileDefaults.autoplay);
      return;
    }

    getProfile().then((p) => {
      profileRef.current = p;
      setThemes(p.driveDiscovery.themeTags.length ? p.driveDiscovery.themeTags : ['mixed']);
      setStyle(p.driveDiscovery.narrationStyle);
      setLengthSec(p.driveDiscovery.lengthSec);
      setLeadTimeMin(p.driveDiscovery.leadTimeMin);
      setAutoplay(p.driveDiscovery.autoplay);
    });
  }, [identity]);

  const openLocationSettings = useCallback(async () => {
    await Linking.openSettings();
  }, []);

  useEffect(() => {
    if (!locationSettingsRequired || sessionId) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      void Location.getForegroundPermissionsAsync().then(permission => {
        if (permission.status === 'granted') {
          setLocationSettingsRequired(false);
          setSessionError(null);
          void startSession();
        }
      });
    });
    return () => subscription.remove();
  }, [locationSettingsRequired, sessionId, startSession]);

  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let inFlight = false;
    const runPing = async () => {
      if (inFlight || disposed || activeSessionIdRef.current !== sessionId) return;
      inFlight = true;
      const revision = requestRevisionRef.current;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (disposed || activeSessionIdRef.current !== sessionId) return;
        setDeviceLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        const heading = typeof loc.coords.heading === 'number' && loc.coords.heading >= 0 ? loc.coords.heading : null;
        const speedKmh = gpsSpeedKmh(loc.coords.speed);
        setLastMotion({ speedKmh, heading });
        const accuracy = typeof loc.coords.accuracy === 'number' && loc.coords.accuracy > 0 ? loc.coords.accuracy : undefined;
        const result = await pingDriveSession(sessionId, loc.coords.latitude, loc.coords.longitude,
          heading, speedKmh, loc.timestamp, accuracy, false, guestId);
        if (disposed || activeSessionIdRef.current !== sessionId) return;
        if (result.mode) setMovementMode(result.mode);
        // Discovery can advance while the current audio identity remains intact.
        setLastResult(result);
        if (!muted && revision === requestRevisionRef.current && result.nextAction === 'PLAY' && result.poi && result.momentId) {
          void loadStoryPlayback({ sessionId, momentId: result.momentId, poiId: result.poi.place_id,
            guideId: fromBackendGuideId(result.narrativePlan?.guideId),
            target: { id: result.poi.place_id, name: result.poi.name,
              latitude: result.poi.geometry.location.lat, longitude: result.poi.geometry.location.lng },
            transcript: result.transcriptText ?? result.textPreview }, result.audioUrl);
        }
      } catch {
        if (!disposed && activeSessionIdRef.current === sessionId) {
          console.warn(JSON.stringify({ event: 'native_discovery_ping_failed' }));
          setSessionError(guideLanguage === 'ru' ? 'Не удалось обновить места рядом. Проверьте соединение.' : 'Could not update nearby places. Check your connection.');
        }
      } finally { inFlight = false; }
    };
    void runPing();
    pingIntervalRef.current = setInterval(runPing, config.pingIntervalSec * 1000);
    return () => { disposed = true; clearDrivePingInterval(pingIntervalRef); };
  }, [guestId, guideLanguage, loadStoryPlayback, muted, sessionId]);

  useEffect(() => () => {
    activeSessionIdRef.current = null;
    ++requestRevisionRef.current;
    activeMomentIdRef.current = null;
    clearDrivePingInterval(pingIntervalRef);
    void realtimeVoiceRef.current?.dispose().catch(() => console.warn('native_voice_dispose_failed'));
    realtimeVoiceRef.current = null;
    void benchmarkNoiseSoundRef.current?.unloadAsync().catch(() => console.warn('native_noise_unload_failed'));
    benchmarkNoiseSoundRef.current = null;
    void clearConversationPlayback();
  }, [clearConversationPlayback]);

  const toggleTheme = (theme: string) => {
    setThemes((prev) =>
      prev.includes(theme) ? prev.filter((item) => item !== theme) : [...prev, theme]
    );
  };

  const finishStory = async (reason: StoryFinishReason) => {
    const id = activeSessionIdRef.current;
    const momentId = activeMomentIdRef.current;
    if (!id || !momentId) return;
    if (reason === 'paused') { await conversationPlaybackRef.current.pause(); return; }
    // Closing/skipping a story is not proof that it was heard to completion.
    activeMomentIdRef.current = null;
    ++requestRevisionRef.current;
    await conversationPlaybackRef.current.clear().catch(() => reportPlaybackError('audio_unload_failed'));
    setLocalPlaybackState('idle');
    setPlayback(undefined);
    setPlayingName(null);
    await finishDriveStory(id, 'skipped', guestId, momentId).catch(() => reportPlaybackError('skip_report_failed'));
  };

  const pausePlayback = () => { void conversationPlaybackRef.current.pause(); };
  const resumePlayback = () => { void conversationPlaybackRef.current.resume(); };

  const applyResumeDirective = useCallback(async (directive: ResumeDirective): Promise<void> => {
    if (directive.action === 'resume_existing') {
      if (!sessionId) return;
      const confirmed = await resumeConversationRequest(sessionId, directive.momentId, guestId).catch(() => null);
      if (confirmed?.resume?.action !== 'resume_existing' || confirmed.resume.momentId !== directive.momentId) return;
      await conversationPlaybackRef.current.resumeOriginal(confirmed.resume.momentId);
      return;
    }
    if (directive.action === 'abandon_previous') {
      // Do not call the legacy finish endpoint: a partial story is not completed.
      activeMomentIdRef.current = null;
      setPlayingName(null);
      setPlayback(undefined);
      setLocalPlaybackState('idle');
      await conversationPlaybackRef.current.clear().catch(() => console.warn('native_audio_unload_failed'));
      storySoundRef.current = null;
    }
  }, [guestId, sessionId]);

  /** Public transport boundary for a future voice input layer; M3 adds no input UI. */
  const beginConversation = useCallback(async (onLocalPause?: () => void): Promise<boolean> => {
    const currentSessionId = sessionId;
    const momentId = activeMomentIdRef.current;
    if (!currentSessionId || !momentId) return false;
    const revision = ++conversationTurnRevisionRef.current;
    setLocalPlaybackState('paused');
    const suspended = await conversationPlaybackRef.current.pauseForConversation();
    if (!suspended || currentSessionId !== sessionId || revision !== conversationTurnRevisionRef.current) return false;
    onLocalPause?.();
    await interruptConversation(currentSessionId, {
      momentId,
      listenedSeconds: Math.floor(suspended.positionMillis / 1000),
    }, guestId);
    return currentSessionId === sessionId && revision === conversationTurnRevisionRef.current;
  }, [guestId, sessionId]);

  const playConversationResponse = useCallback(async (audioUrl: string, directive: ResumeDirective) => {
    pendingResumeRef.current = directive;
    const oldSound = conversationSoundRef.current;
    conversationSoundRef.current = null;
    if (oldSound) await oldSound.unloadAsync().catch(() => console.warn('native_audio_unload_failed'));
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true }, (status) => {
        if (status.isLoaded && status.didJustFinish) {
          const resume = pendingResumeRef.current;
          pendingResumeRef.current = null;
          if (resume) void applyResumeDirective(resume);
        }
      });
      conversationSoundRef.current = sound;
    } catch (error) {
      setSessionError((error as Error).message);
      const resume = pendingResumeRef.current;
      pendingResumeRef.current = null;
      if (resume) await applyResumeDirective(resume);
    }
  }, [applyResumeDirective]);

  const sendConversationTurn = useCallback(async (text: string): Promise<ConversationTurnResult | null> => {
    const currentSessionId = sessionId;
    if (!currentSessionId || !text.trim()) return null;
    const revision = ++conversationTurnRevisionRef.current;
    const clientTurnId = `m3-${Date.now()}-${revision}`;
    const result = await sendConversationTurnRequest(currentSessionId, { text: text.trim(), clientTurnId }, guestId);
    if (!isCurrentConversationTurn(currentSessionId, revision, sessionId, conversationTurnRevisionRef.current)) return null;
    setConversationResult(result);
    setConversationMapActions(result.mapActions ?? []);
    setNavigationHandoff(result.navigationAction ?? null);
    if (result.audioUrl) void playConversationResponse(result.audioUrl, result.resume);
    else void applyResumeDirective(result.resume);
    return result;
  }, [applyResumeDirective, guestId, playConversationResponse, sessionId]);

  const resumeConversation = useCallback(async () => {
    const momentId = conversationPlaybackRef.current.getSuspended()?.momentId;
    if (!momentId) return;
    await applyResumeDirective({ action: 'resume_existing', momentId });
  }, [applyResumeDirective]);

  const cancelConversation = useCallback(async () => {
    if (!sessionId) return;
    conversationTurnRevisionRef.current += 1;
    await cancelConversationRequest(sessionId, undefined, guestId);
    setConversationResult(null);
    setConversationMapActions([]);
    setNavigationHandoff(null);
  }, [guestId, sessionId]);

  const activateRealtimeVoice = useCallback(async (): Promise<boolean> => {
    if (!sessionId || identity.status !== 'authenticated') {
      setSessionError('Sign in to use realtime voice.');
      return false;
    }
    const compatibility = await checkApiCompatibility();
    setApiCompatibilityStatus(compatibility.compatible ? 'compatible' : 'incompatible');
    if (!compatibility.compatible) {
      setSessionError(compatibility.reachable
        ? `Connected backend is not compatible with M4 realtime voice. API: ${config.apiBase}`
        : `Hey City API is unreachable from this iPhone. API: ${config.apiBase}`);
      return false;
    }
    if (!realtimeVoiceRef.current) {
      try {
        // react-native-webrtc is intentionally loaded only on explicit activation.
        // Expo Go lacks this module; the caught error points users to a dev/native build.
        if (config.m4NativeBenchmarkEnabled && !realtimeBenchmarkProvider) {
          setSessionError('Select OpenAI or Gemini in the M4 benchmark control before Talk.');
          return false;
        }
        const [{ RealtimeVoiceClientSession }, { createNativeRealtimeVoiceTransport }] = await Promise.all([
          import('./realtimeVoice'),
          import('./realtimeVoiceTransportFactory'),
        ]);
        const benchmarkProvider = config.m4NativeBenchmarkEnabled
          ? realtimeBenchmarkProvider ?? undefined
          : undefined;
        const transport = createNativeRealtimeVoiceTransport(benchmarkProvider);
        if (benchmarkProvider) {
          const [benchmark, nativeBenchmark] = await Promise.all([
            import('./realtimeVoiceBenchmark'),
            import('./realtimeVoiceBenchmarkNative'),
          ]);
          realtimeBenchmarkRecorderRef.current ??= new benchmark.M4NativeBenchmarkRecorder(
            await nativeBenchmark.createNativeBenchmarkEnvironment(),
          );
          const repetitionKey = `${benchmarkProvider}:${realtimeBenchmarkScenario}:${guideId}:${guideLanguage}`;
          const repetition = (realtimeBenchmarkRepetitionRef.current[repetitionKey] ?? 0) + 1;
          realtimeBenchmarkRepetitionRef.current[repetitionKey] = repetition;
          realtimeBenchmarkRecorderRef.current.beginTrial({
            scenario: realtimeBenchmarkScenario,
            repetition,
            provider: benchmarkProvider,
            guide: guideId,
            language: guideLanguage,
          });
          setRealtimeBenchmarkExportStatus(`${benchmarkProvider} ${realtimeBenchmarkScenario} run ${repetition} recording`);
        }
        realtimeVoiceRef.current = new RealtimeVoiceClientSession({
          sessionId,
          transport,
          ...(benchmarkProvider ? { benchmarkProvider } : {}),
          interruptInitialStory: beginConversation,
          connect: request => connectRealtimeVoice(sessionId, request),
          submitTurn: realtimeTurn => submitRealtimeVoiceTurn(sessionId, realtimeTurn),
          bargeIn: () => bargeInRealtimeVoice(sessionId),
          closeRemote: () => closeRealtimeVoice(sessionId),
          reportUsage: report => reportRealtimeVoiceUsage(sessionId, report),
          requestFallback: input => requestRealtimeVoiceFallback(sessionId, input),
          onGroundedResult: result => {
            setConversationResult(result);
            setConversationMapActions(result.mapActions ?? []);
            setNavigationHandoff(result.navigationAction ?? null);
          },
          onAnswerComplete: result => applyResumeDirective(result.resume),
          playFallbackAudio: async audioUrl => {
            await new Promise<void>(async resolve => {
              try {
                const { sound } = await Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true }, status => {
                  if (status.isLoaded && didFinish(status)) resolve();
                });
                const previous = conversationSoundRef.current;
                conversationSoundRef.current = sound;
                if (previous) await previous.unloadAsync().catch(() => console.warn('native_audio_unload_failed'));
              } catch {
                resolve();
              }
            });
          },
          onStateChange: setRealtimeVoiceState,
          onClosed: resumeConversation,
          ...(benchmarkProvider ? {
            onBenchmarkEvent: event => realtimeBenchmarkRecorderRef.current?.record(event),
          } : {}),
          inactivityTimeoutMs: 45_000,
        });
      } catch {
        setRealtimeVoiceState('error');
        setSessionError('Realtime voice requires a development/native build; Expo Go is not supported.');
        return false;
      }
    }
    if (config.m4NativeBenchmarkEnabled && realtimeBenchmarkProvider) {
      const recorder = realtimeBenchmarkRecorderRef.current;
      if (recorder && !recorder.hasActiveTrial()) {
        const repetitionKey = `${realtimeBenchmarkProvider}:${realtimeBenchmarkScenario}:${guideId}:${guideLanguage}`;
        const repetition = (realtimeBenchmarkRepetitionRef.current[repetitionKey] ?? 0) + 1;
        realtimeBenchmarkRepetitionRef.current[repetitionKey] = repetition;
        recorder.beginTrial({
          scenario: realtimeBenchmarkScenario,
          repetition,
          provider: realtimeBenchmarkProvider,
          guide: guideId,
          language: guideLanguage,
        });
        setRealtimeBenchmarkExportStatus(`${realtimeBenchmarkProvider} ${realtimeBenchmarkScenario} run ${repetition} recording`);
      }
    }
    const activated = await realtimeVoiceRef.current.activate();
    if (!activated && config.m4NativeBenchmarkEnabled) {
      realtimeBenchmarkRecorderRef.current?.finishTrial({ notes: 'activation_failed_fail_closed' });
      setRealtimeBenchmarkExportStatus('Activation failed; closed attempt recorded');
    }
    return activated;
  }, [applyResumeDirective, beginConversation, guideId, guideLanguage, identity.status, realtimeBenchmarkProvider, realtimeBenchmarkScenario, resumeConversation, sessionId]);

  const closeRealtimeVoiceSession = useCallback(async () => {
    const voice = realtimeVoiceRef.current;
    if (voice) await voice.close().catch(() => {});
    setRealtimeVoiceState('closed');
    if (config.m4NativeBenchmarkEnabled) {
      const trial = realtimeBenchmarkRecorderRef.current?.finishTrial();
      if (trial) setRealtimeBenchmarkExportStatus(`${trial.provider} ${trial.scenario} run ${trial.repetition} saved in memory`);
    }
  }, []);

  const selectRealtimeBenchmarkProvider = useCallback(async (provider: NativeBenchmarkProvider) => {
    const voice = realtimeVoiceRef.current;
    realtimeVoiceRef.current = null;
    if (voice) await voice.dispose().catch(() => {});
    const benchmarkNoise = benchmarkNoiseSoundRef.current;
    benchmarkNoiseSoundRef.current = null;
    if (benchmarkNoise) await benchmarkNoise.unloadAsync().catch(() => console.warn('native_audio_unload_failed'));
    realtimeBenchmarkRecorderRef.current?.finishTrial({ notes: 'provider_changed' });
    setRealtimeVoiceState('closed');
    setRealtimeBenchmarkProvider(provider);
  }, []);

  const exportRealtimeBenchmark = useCallback(async (): Promise<boolean> => {
    const recorder = realtimeBenchmarkRecorderRef.current;
    if (!recorder) {
      setRealtimeBenchmarkExportStatus('No benchmark run to export');
      return false;
    }
    recorder.finishTrial();
    const nativeBenchmark = await import('./realtimeVoiceBenchmarkNative');
    const saved = await nativeBenchmark.saveNativeBenchmarkArtifact(recorder.artifact);
    const shared = await nativeBenchmark.shareNativeBenchmarkArtifact(saved.jsonUri);
    setRealtimeBenchmarkExportStatus(shared ? 'Benchmark JSON exported' : `Saved: ${saved.jsonUri}`);
    return true;
  }, []);

  const playRealtimeBenchmarkNoise = useCallback(async (): Promise<void> => {
    const previous = benchmarkNoiseSoundRef.current;
    benchmarkNoiseSoundRef.current = null;
    if (previous) await previous.unloadAsync().catch(() => console.warn('native_audio_unload_failed'));
    const { sound } = await Audio.Sound.createAsync(
      require('../../../assets/m4-road-noise-v1.wav'),
      { shouldPlay: true, volume: 0.35 },
      status => {
        if (status.isLoaded && didFinish(status)) {
          void sound.unloadAsync().catch(() => console.warn('native_audio_unload_failed'));
          if (benchmarkNoiseSoundRef.current === sound) benchmarkNoiseSoundRef.current = null;
        }
      },
    );
    benchmarkNoiseSoundRef.current = sound;
    setRealtimeBenchmarkExportStatus('B4 controlled road-noise fixture playing at app volume 0.35');
  }, []);

  useEffect(() => {
    if (!realtimeVoiceRef.current) return;
    void closeRealtimeVoiceSession();
  }, [closeRealtimeVoiceSession, guideId, guideLanguage]);

  const forceAheadRefresh = async () => {
    if (!sessionId) return;
    setAheadRefreshLoading(true);
    setAheadRefreshStatus(null);
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const heading =
        typeof loc.coords.heading === 'number' && loc.coords.heading >= 0
          ? loc.coords.heading
          : lastHeadingRef.current;
      const speedMps =
        typeof loc.coords.speed === 'number' && loc.coords.speed > 0
          ? loc.coords.speed
          : 0;
      const result = await forceAheadDiscoveryRefresh({
        sessionId,
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        heading,
        speed: gpsSpeedKmh(loc.coords.speed),
        timestamp: loc.timestamp,
        accuracyMeters:
          typeof loc.coords.accuracy === 'number' && loc.coords.accuracy > 0
            ? loc.coords.accuracy
            : undefined,
        guestId,
      });
      setLastResult((current) => ({
        ...(current ?? { nextAction: 'NONE' as const }),
        aheadDiscovery: result.aheadDiscovery,
      }));
      setAheadRefreshStatus(result.aheadDiscovery?.decision.type ?? 'ok');
    } catch (e) {
      setAheadRefreshStatus((e as Error).message);
    } finally {
      setAheadRefreshLoading(false);
    }
  };

  const presentation = mapDriveSessionToPresentation(lastResult, {
    sessionActive: Boolean(sessionId),
    playbackState: localPlaybackState,
    playback,
    movementMode,
    audioProgress,
  });

  return {
    driveDiscoveryOn,
    sessionId,
    sessionError,
    settingsOpen,
    setSettingsOpen,
    themes,
    style,
    setStyle,
    lengthSec,
    leadTimeMin,
    autoplay,
    setAutoplay,
    muted,
    setMuted,
    lastResult,
    lastMotion,
    movementMode,
    deviceLocation,
    aheadRefreshLoading,
    aheadRefreshStatus,
    presentation,
    startSession,
    stopSession,
    toggleTheme,
    finishStory,
    pausePlayback,
    resumePlayback,
    forceAheadRefresh,
    beginConversation,
    sendConversationTurn,
    resumeConversation,
    cancelConversation,
    conversationResult,
    conversationMapActions,
    navigationHandoff,
    realtimeVoiceState,
    activateRealtimeVoice,
    closeRealtimeVoiceSession,
    locationSettingsRequired,
    openLocationSettings,
    apiCompatibilityStatus,
    apiBuildSha,
    appBuildSha: config.buildSha,
    apiBase: config.apiBase,
    realtimeBenchmarkEnabled: config.m4NativeBenchmarkEnabled,
    realtimeBenchmarkProvider,
    selectRealtimeBenchmarkProvider,
    realtimeBenchmarkScenario,
    setRealtimeBenchmarkScenario,
    realtimeBenchmarkExportStatus,
    exportRealtimeBenchmark,
    playRealtimeBenchmarkNoise,
  };
}

function didFinish(status: { didJustFinish?: boolean }): boolean {
  return status.didJustFinish === true;
}
