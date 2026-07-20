import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  finishDriveStory,
  pingDriveSession,
  startDriveSession,
  stopDriveSession,
  type PingResult,
  type StoryFinishReason,
} from '../../api/drive';
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

export type DriveMotion = { speedKmh: number; heading: number };
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
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const profileRef = useRef<Awaited<ReturnType<typeof getProfile>> | null>(null);
  const lastHeadingRef = useRef(0);

  const startSession = useCallback(async () => {
    setSessionError(null);
    if (!shouldLoadProfile(identity)) {
      setSessionId('guest-drive-demo');
      setDriveDiscoveryOn(true);
      setLocalPlaybackState('idle');
      setLastResult(null);
      setPlayingName(null);
      return;
    }

    try {
      const profile = profileRef.current ?? (await getProfile());
      profileRef.current = profile;
      const { sessionId: id } = await startDriveSession({
        themeTags: themes,
        narrationStyle: style,
        lengthSec,
        leadTimeMin,
        voiceId: profile.driveDiscovery.voiceId,
        guideId,
        language: guideLanguage,
        autoplay,
      });
      setSessionId(id);
      setDriveDiscoveryOn(true);
      setLocalPlaybackState('idle');
    } catch (e) {
      setSessionError((e as Error).message);
      console.error(e);
    }
  }, [autoplay, guideId, guideLanguage, identity, leadTimeMin, lengthSec, style, themes]);

  const stopSession = useCallback(async () => {
    if (!sessionId) return;
    if (shouldLoadProfile(identity)) {
      try {
        await stopDriveSession(sessionId);
      } catch (_) {}
    }
    setSessionId(null);
    setDriveDiscoveryOn(false);
    clearDrivePingInterval(pingIntervalRef);
    setLastResult(null);
    setPlayingName(null);
    setLocalPlaybackState('idle');
    setSessionError(null);
  }, [identity, sessionId]);

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
    if (!sessionId || muted || !shouldLoadProfile(identity)) return;

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
        lastHeadingRef.current = heading;

        const speedMps =
          typeof loc.coords.speed === 'number' && loc.coords.speed > 0
            ? loc.coords.speed
            : 0;
        const speedKmh = speedMps * 3.6;
        setLastMotion({ speedKmh, heading });

        const result = await pingDriveSession(
          sessionId,
          loc.coords.latitude,
          loc.coords.longitude,
          heading,
          speedKmh,
          Date.now()
        );
        setLastResult(result);
        if (result.nextAction === 'PLAY' && result.poi) {
          setPlayingName(result.poi.name);
          setLocalPlaybackState((current) => (current === 'paused' ? current : 'playing'));
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
  }, [identity, muted, sessionId]);

  useEffect(() => () => clearDrivePingInterval(pingIntervalRef), []);

  const toggleTheme = (theme: string) => {
    setThemes((prev) =>
      prev.includes(theme) ? prev.filter((item) => item !== theme) : [...prev, theme]
    );
  };

  const finishStory = async (reason: StoryFinishReason) => {
    if (!sessionId) return;
    setSessionError(null);
    try {
      const result = await finishDriveStory(sessionId, reason);
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
    }
  };

  const resumePlayback = () => {
    if (localPlaybackState === 'paused') {
      setLocalPlaybackState(playingName ? 'playing' : 'idle');
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
    presentation,
    startSession,
    stopSession,
    toggleTheme,
    finishStory,
    pausePlayback,
    resumePlayback,
  };
}
