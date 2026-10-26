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
import type { GuidePreference, SupportedLocale } from '../../localization/preferences';
import type { PlaybackMoment } from '../../presentation/livePresentation';
import { clearRuntimeInterval } from './runtimeControllerContracts';
import { ConversationPlayback, isCurrentConversationTurn } from './conversationPlayback';
import { gpsSpeedKmh } from './gpsMotion';
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

export type DriveMotion = { speedKmh: number | null; heading: number | null; observedAtMs: number };
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
  const [localPlaybackState, setLocalPlaybackState] = useState<PlaybackState>('idle');
  const [playbackMoment, setPlaybackMoment] = useState<PlaybackMoment | null>(null);
  const [lastMotion, setLastMotion] = useState<DriveMotion | null>(null);
  const [movementMode, setMovementMode] = useState<'walking' | 'vehicle'>('walking');
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
  const activeMomentIdRef = useRef<string | null>(null);
  const playbackMomentRef = useRef<PlaybackMoment | null>(null);
  const playbackGenerationRef = useRef(0);
  const completedMomentIdsRef = useRef(new Set<string>());
  const pingInFlightRef = useRef(false);
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
      setSessionId(id);
      setMovementMode('walking');
      activeMomentIdRef.current = null;
      playbackMomentRef.current = null;
      setPlaybackMoment(null);
      playbackGenerationRef.current += 1;
      completedMomentIdsRef.current.clear();
      conversationTurnRevisionRef.current += 1;
      setConversationResult(null);
      setConversationMapActions([]);
      setNavigationHandoff(null);
      setDriveDiscoveryOn(true);
      setLocalPlaybackState('idle');
    } catch (e) {
      setSessionError((e as Error).message);
      console.error(e);
    }
  }, [autoplay, guestId, guideId, guideLanguage, identity, leadTimeMin, lengthSec, style, themes]);

  const clearConversationPlayback = useCallback(async () => {
    pendingResumeRef.current = null;
    const conversationSound = conversationSoundRef.current;
    conversationSoundRef.current = null;
    if (conversationSound) await conversationSound.unloadAsync().catch(() => {});
    await conversationPlaybackRef.current.clear().catch(() => {});
    storySoundRef.current = null;
  }, []);

  const stopSession = useCallback(async () => {
    if (!sessionId) return;
    const voice = realtimeVoiceRef.current;
    realtimeVoiceRef.current = null;
    if (voice) await voice.dispose().catch(() => {});
    try {
      await stopDriveSession(sessionId, guestId);
    } catch (_) {}
    setSessionId(null);
    activeMomentIdRef.current = null;
    playbackMomentRef.current = null;
    setPlaybackMoment(null);
    playbackGenerationRef.current += 1;
    conversationTurnRevisionRef.current += 1;
    void clearConversationPlayback();
    setDriveDiscoveryOn(false);
    clearDrivePingInterval(pingIntervalRef);
    setLastResult(null);
    setPlayingName(null);
    setLocalPlaybackState('idle');
    setSessionError(null);
  }, [clearConversationPlayback, guestId, sessionId]);

  const loadStoryPlayback = useCallback(async (moment: PlaybackMoment, audioUrl: string) => {
    const generation = ++playbackGenerationRef.current;
    // Stop the previous native sound before the new moment is allowed to play.
    await conversationPlaybackRef.current.clear().catch(() => {
      setSessionError('Could not release previous audio.');
    });
    storySoundRef.current = null;
    const current = () => playbackGenerationRef.current === generation &&
      activeMomentIdRef.current === moment.momentId && playbackMomentRef.current?.sessionId === moment.sessionId;
    if (!current()) return;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      if (!current()) return;
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl }, { shouldPlay: true }, status => {
          if (!current()) return; // late callbacks never complete a different story
          if (!status.isLoaded) {
            if (status.error) {
              setLocalPlaybackState('error');
              setSessionError('Story audio playback failed.');
            }
            return;
          }
          if (status.didJustFinish) {
            if (completedMomentIdsRef.current.has(moment.momentId)) return;
            completedMomentIdsRef.current.add(moment.momentId);
            // A single completion is tied to this exact session and moment.
            activeMomentIdRef.current = null;
            playbackMomentRef.current = null;
            setPlaybackMoment(null);
            setPlayingName(null);
            setLocalPlaybackState('completed');
            void finishDriveStory(moment.sessionId, 'ended', guestId, moment.momentId).catch(() => {
              setSessionError('Story completion could not be confirmed.');
            });
          } else if (status.isPlaying) {
            setLocalPlaybackState('playing');
          }
        },
      );
      if (!current()) {
        await sound.unloadAsync().catch(() => {});
        return;
      }
      storySoundRef.current = sound;
      conversationPlaybackRef.current.attach(moment.momentId, audioUrl, sound);
    } catch {
      if (!current()) return;
      setSessionError('Story audio could not be loaded.');
      setLocalPlaybackState('error');
    }
  }, [guestId]);


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
    if (!sessionId || muted) return;

    const runPing = async () => {
      if (pingInFlightRef.current) return;
      pingInFlightRef.current = true;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setDeviceLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        const rawHeading = loc.coords.heading;
        const heading =
          typeof rawHeading === 'number' && rawHeading >= 0
            ? rawHeading
            : lastHeadingRef.current;
        if (heading !== null) lastHeadingRef.current = heading;

        const speedKmh = gpsSpeedKmh(loc.coords.speed);
        setLastMotion({
          speedKmh,
          // Camera uses only this sample's trusted heading, not the stale
          // fallback used by Discovery's separate heading-grace policy.
          heading: typeof rawHeading === 'number' && Number.isFinite(rawHeading) && rawHeading >= 0
            ? rawHeading : null,
          observedAtMs: Date.now(),
        });
        const accuracyMeters =
          typeof loc.coords.accuracy === 'number' && loc.coords.accuracy > 0
            ? loc.coords.accuracy
            : undefined;

        const result = await pingDriveSession(
          sessionId,
          loc.coords.latitude,
          loc.coords.longitude,
          heading,
          speedKmh,
          Date.now(),
          accuracyMeters,
          false,
          guestId
        );
        setLastResult(result);
        if (result.mode === 'walking' || result.mode === 'vehicle') setMovementMode(result.mode);
        // PLAY is a server instruction to begin loading, not proof of audible playback.
        if (result.nextAction === 'PLAY' && result.momentId && result.poi) {
          if (activeMomentIdRef.current !== result.momentId &&
              !completedMomentIdsRef.current.has(result.momentId)) {
            const moment: PlaybackMoment = {
              sessionId, momentId: result.momentId, poiId: result.poi.place_id,
              guideId, name: result.poi.name, transcriptText: result.transcriptText,
              latitude: result.poi.geometry.location.lat, longitude: result.poi.geometry.location.lng,
            };
            playbackMomentRef.current = moment;
            activeMomentIdRef.current = moment.momentId;
            setPlaybackMoment(moment);
            setPlayingName(moment.name);
            setLocalPlaybackState(result.audioUrl ? 'loading' : 'text-only');
            if (result.audioUrl) void loadStoryPlayback(moment, result.audioUrl);
          }
        }
        // A fresh discovery ping does not supersede the owner of the current
        // native audio. Only actual replacement, completion, skip or teardown can.

      } catch {
        setSessionError('Unable to update discovery. Check the connection.');
      } finally {
        pingInFlightRef.current = false;
      }
    };

    runPing();
    const id = setInterval(runPing, config.pingIntervalSec * 1000);
    pingIntervalRef.current = id;
    return () => clearDrivePingInterval(pingIntervalRef);
  }, [guestId, guideId, loadStoryPlayback, muted, sessionId]);

  useEffect(() => () => {
    clearDrivePingInterval(pingIntervalRef);
    void realtimeVoiceRef.current?.dispose().catch(() => {});
    realtimeVoiceRef.current = null;
    void benchmarkNoiseSoundRef.current?.unloadAsync().catch(() => {});
    benchmarkNoiseSoundRef.current = null;
    void clearConversationPlayback();
  }, [clearConversationPlayback]);

  const toggleTheme = (theme: string) => {
    setThemes((prev) =>
      prev.includes(theme) ? prev.filter((item) => item !== theme) : [...prev, theme]
    );
  };

  const finishStory = async (reason: StoryFinishReason) => {
    if (!sessionId || !activeMomentIdRef.current) return;
    setSessionError(null);
    try {
      const result = await finishDriveStory(sessionId, reason, guestId, activeMomentIdRef.current);
      if (result.stale) return;
      activeMomentIdRef.current = null;
      setPlayingName(null);
      playbackGenerationRef.current += 1;
      void clearConversationPlayback();
      playbackMomentRef.current = null;
      setPlaybackMoment(null);
      setLocalPlaybackState(reason === 'paused' ? 'paused' : 'completed');
      setLastResult({
        nextAction: 'NONE',
        decision: {
          type: 'hold',
          reason: result.activeStoryWasPlaying ? 'cooldown_active' : 'no_candidate',
        },
      });
    } catch (e) {
      setSessionError((e as Error).message);
      console.error(e);
    }
  };

  const pausePlayback = () => {
    if (localPlaybackState === 'playing' || localPlaybackState === 'loading') {
      setLocalPlaybackState('paused');
      void storySoundRef.current?.pauseAsync().catch(() => {});
    }
  };

  const resumePlayback = () => {
    if (localPlaybackState === 'paused') {
      setLocalPlaybackState(playingName ? 'playing' : 'idle');
      void storySoundRef.current?.playAsync().catch(() => {});
    }
  };

  const applyResumeDirective = useCallback(async (directive: ResumeDirective): Promise<void> => {
    if (directive.action === 'resume_existing') {
      if (!sessionId) return;
      const confirmed = await resumeConversationRequest(sessionId, directive.momentId, guestId).catch(() => null);
      if (confirmed?.resume?.action !== 'resume_existing' || confirmed.resume.momentId !== directive.momentId) return;
      const resumed = await conversationPlaybackRef.current.resumeOriginal(confirmed.resume.momentId);
      if (resumed) setLocalPlaybackState('playing');
      return;
    }
    if (directive.action === 'abandon_previous') {
      // Do not call the legacy finish endpoint: a partial story is not completed.
      activeMomentIdRef.current = null;
      setPlayingName(null);
      setLocalPlaybackState('idle');
      await conversationPlaybackRef.current.clear().catch(() => {});
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
    if (oldSound) await oldSound.unloadAsync().catch(() => {});
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
                if (previous) await previous.unloadAsync().catch(() => {});
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
    if (benchmarkNoise) await benchmarkNoise.unloadAsync().catch(() => {});
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
    if (previous) await previous.unloadAsync().catch(() => {});
    const { sound } = await Audio.Sound.createAsync(
      require('../../../assets/m4-road-noise-v1.wav'),
      { shouldPlay: true, volume: 0.35 },
      status => {
        if (status.isLoaded && didFinish(status)) {
          void sound.unloadAsync().catch(() => {});
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
      const speedKmh = gpsSpeedKmh(loc.coords.speed);
      const result = await forceAheadDiscoveryRefresh({
        sessionId,
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        heading,
        speed: speedKmh,
        timestamp: Date.now(),
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
    playbackMoment,
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
    playbackMoment,
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
