import { useCallback, useEffect, useRef, useState } from 'react';
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
import { config } from '../../config';
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

export type DriveMotion = { speedKmh: number; heading: number | null };
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
  const [lastMotion, setLastMotion] = useState<DriveMotion | null>(null);
  const [aheadRefreshLoading, setAheadRefreshLoading] = useState(false);
  const [aheadRefreshStatus, setAheadRefreshStatus] = useState<string | null>(null);
  const [conversationResult, setConversationResult] = useState<ConversationTurnResult | null>(null);
  const [conversationMapActions, setConversationMapActions] = useState<MapAction[]>([]);
  const [navigationHandoff, setNavigationHandoff] = useState<NavigationAction | null>(null);
  const [realtimeVoiceState, setRealtimeVoiceState] = useState<RealtimeVoiceClientState>('closed');
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeMomentIdRef = useRef<string | null>(null);
  const profileRef = useRef<Awaited<ReturnType<typeof getProfile>> | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const storySoundRef = useRef<Audio.Sound | null>(null);
  const conversationSoundRef = useRef<Audio.Sound | null>(null);
  const conversationPlaybackRef = useRef(new ConversationPlayback());
  const conversationTurnRevisionRef = useRef(0);
  const pendingResumeRef = useRef<ResumeDirective | null>(null);
  const realtimeVoiceRef = useRef<RealtimeVoiceClientSession | null>(null);
  const guestId = identity.status === 'guest' ? identity.guestId : undefined;

  const startSession = useCallback(async () => {
    setSessionError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setSessionError('Location permission is required for Explore Mode.');
        return;
      }
      const profile = shouldLoadProfile(identity)
        ? profileRef.current ?? (await getProfile())
        : null;
      if (profile) profileRef.current = profile;
      const { sessionId: id } = await startDriveSession({
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
      activeMomentIdRef.current = null;
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
    conversationTurnRevisionRef.current += 1;
    void clearConversationPlayback();
    setDriveDiscoveryOn(false);
    clearDrivePingInterval(pingIntervalRef);
    setLastResult(null);
    setPlayingName(null);
    setLocalPlaybackState('idle');
    setSessionError(null);
  }, [clearConversationPlayback, guestId, sessionId]);

  const loadStoryPlayback = useCallback(async (momentId: string, audioUrl: string) => {
    if (activeMomentIdRef.current === momentId && storySoundRef.current) return;
    await conversationPlaybackRef.current.clear().catch(() => {});
    storySoundRef.current = null;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setLocalPlaybackState(status.isPlaying ? 'playing' : 'paused');
            if (status.didJustFinish && activeMomentIdRef.current === momentId && sessionId) {
              void finishDriveStory(sessionId, 'ended', guestId, momentId).catch(() => {});
              activeMomentIdRef.current = null;
              setPlayingName(null);
              setLocalPlaybackState('completed');
            }
          }
        },
      );
      if (activeMomentIdRef.current !== momentId) {
        await sound.unloadAsync();
        return;
      }
      storySoundRef.current = sound;
      conversationPlaybackRef.current.attach(momentId, audioUrl, sound);
    } catch (error) {
      setSessionError((error as Error).message);
      setLocalPlaybackState('error');
    }
  }, [guestId, sessionId]);

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

  useEffect(() => {
    if (!sessionId || muted) return;

    const runPing = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const rawHeading = loc.coords.heading;
        const heading =
          typeof rawHeading === 'number' && rawHeading >= 0
            ? rawHeading
            : lastHeadingRef.current;
        if (heading !== null) lastHeadingRef.current = heading;

        const speedMps =
          typeof loc.coords.speed === 'number' && loc.coords.speed > 0
            ? loc.coords.speed
            : 0;
        const speedKmh = speedMps * 3.6;
        setLastMotion({ speedKmh, heading });
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
        if (result.nextAction === 'PLAY' && result.poi) {
          activeMomentIdRef.current = result.momentId ?? null;
          setPlayingName(result.poi.name);
          setLocalPlaybackState((current) => (current === 'paused' ? current : 'playing'));
          if (result.momentId && result.audioUrl) void loadStoryPlayback(result.momentId, result.audioUrl);
        } else if (result.decision?.type !== 'hold' || result.decision.reason !== 'already_listening') {
          setPlayingName(null);
          setLocalPlaybackState((current) => (current === 'paused' ? current : 'idle'));
        }
      } catch (_) {}
    };

    runPing();
    const id = setInterval(runPing, config.pingIntervalSec * 1000);
    pingIntervalRef.current = id;
    return () => clearDrivePingInterval(pingIntervalRef);
  }, [guestId, loadStoryPlayback, muted, sessionId]);

  useEffect(() => () => {
    clearDrivePingInterval(pingIntervalRef);
    void realtimeVoiceRef.current?.dispose().catch(() => {});
    realtimeVoiceRef.current = null;
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
  const beginConversation = useCallback(async (): Promise<boolean> => {
    const currentSessionId = sessionId;
    const momentId = activeMomentIdRef.current;
    if (!currentSessionId || !momentId) return false;
    const revision = ++conversationTurnRevisionRef.current;
    setLocalPlaybackState('paused');
    const suspended = await conversationPlaybackRef.current.pauseForConversation();
    if (!suspended || currentSessionId !== sessionId || revision !== conversationTurnRevisionRef.current) return false;
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
    if (!realtimeVoiceRef.current) {
      try {
        // react-native-webrtc is intentionally loaded only on explicit activation.
        // Expo Go lacks this module; the caught error points users to a dev/native build.
        const [{ RealtimeVoiceClientSession }, { NativeWebRtcVoiceTransport }, { OpenAIRealtimeCodec }] = await Promise.all([
          import('./realtimeVoice'),
          import('./nativeWebRtcVoiceTransport'),
          import('./openAIRealtimeCodec'),
        ]);
        const transport = new NativeWebRtcVoiceTransport(new OpenAIRealtimeCodec());
        realtimeVoiceRef.current = new RealtimeVoiceClientSession({
          sessionId,
          transport,
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
          inactivityTimeoutMs: 45_000,
        });
      } catch {
        setRealtimeVoiceState('error');
        setSessionError('Realtime voice requires a development/native build; Expo Go is not supported.');
        return false;
      }
    }
    return realtimeVoiceRef.current.activate();
  }, [applyResumeDirective, beginConversation, identity.status, resumeConversation, sessionId]);

  const closeRealtimeVoiceSession = useCallback(async () => {
    const voice = realtimeVoiceRef.current;
    realtimeVoiceRef.current = null;
    if (voice) await voice.dispose().catch(() => {});
    setRealtimeVoiceState('closed');
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
        speed: speedMps * 3.6,
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
  };
}

function didFinish(status: { didJustFinish?: boolean }): boolean {
  return status.didJustFinish === true;
}
