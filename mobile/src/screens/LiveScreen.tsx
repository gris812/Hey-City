import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import {
  finishDriveStory,
  pingDriveSession,
  PingResult,
  startDriveSession,
  stopDriveSession,
  StoryFinishReason,
} from '../api/drive';
import { getProfile } from '../api/me';
import { config } from '../config';
import { LiveControls } from '../components/live/LiveControls';
import { LiveStatusPill } from '../components/live/LiveStatusPill';
import { StoryPanel } from '../components/live/StoryPanel';
import {
  mapDriveSessionToPresentation,
  type PlaybackState,
} from '../presentation';
import { colors, radius, spacing, typography } from '../theme';

const THEME_TAGS = [
  'history',
  'architecture',
  'cinema_culture',
  'food_coffee',
  'religion',
  'engineering_infrastructure',
  'mixed',
];

const STYLES = [
  'documentary',
  'light_ironic',
  'detective',
  'romantic',
  'tech',
  'mini_lecture',
];

type LiveMode = 'city_explorer' | 'drive_discovery';

export function LiveScreen() {
  const [mode, setMode] = useState<LiveMode>('city_explorer');
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
  const [lastMotion, setLastMotion] = useState<{ speedKmh: number; heading: number } | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const profileRef = useRef<Awaited<ReturnType<typeof getProfile>> | null>(null);
  const lastHeadingRef = useRef(0);

  const startSession = useCallback(async () => {
    setSessionError(null);
    try {
      const profile = profileRef.current ?? (await getProfile());
      profileRef.current = profile;
      const { sessionId: id } = await startDriveSession({
        themeTags: themes,
        narrationStyle: style,
        lengthSec,
        leadTimeMin,
        voiceId: profile.driveDiscovery.voiceId,
        language: profile.driveDiscovery.languageDefault === 'auto' ? 'ru' : profile.driveDiscovery.languageDefault,
        autoplay,
      });
      setSessionId(id);
      setDriveDiscoveryOn(true);
      setLocalPlaybackState('idle');
    } catch (e) {
      setSessionError((e as Error).message);
      console.error(e);
    }
  }, [themes, style, lengthSec, leadTimeMin, autoplay]);

  const stopSession = useCallback(async () => {
    if (sessionId) {
      try {
        await stopDriveSession(sessionId);
      } catch (_) {}
      setSessionId(null);
      setDriveDiscoveryOn(false);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      setLastResult(null);
      setPlayingName(null);
      setLocalPlaybackState('idle');
      setSessionError(null);
    }
  }, [sessionId]);

  useEffect(() => {
    getProfile().then((p) => {
      profileRef.current = p;
      setThemes(p.driveDiscovery.themeTags.length ? p.driveDiscovery.themeTags : ['mixed']);
      setStyle(p.driveDiscovery.narrationStyle);
      setLengthSec(p.driveDiscovery.lengthSec);
      setLeadTimeMin(p.driveDiscovery.leadTimeMin);
      setAutoplay(p.driveDiscovery.autoplay);
    });
  }, []);

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
          if (result.audioUrl) {
            // TODO: play audio with expo-av
          }
        } else if (result.decision?.type !== 'hold' || result.decision.reason !== 'already_listening') {
          setPlayingName(null);
          setLocalPlaybackState((current) => (current === 'paused' ? current : 'idle'));
        }
      } catch (_) {}
    };

    runPing();
    const id = setInterval(runPing, config.pingIntervalSec * 1000);
    pingIntervalRef.current = id;
    return () => {
      clearInterval(id);
      pingIntervalRef.current = null;
    };
  }, [sessionId, muted]);

  const toggleTheme = (t: string) => {
    setThemes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
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

  const presentation = mapDriveSessionToPresentation(lastResult, {
    sessionActive: Boolean(sessionId),
    playbackState: localPlaybackState,
  });

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>Live</Text>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'city_explorer' && styles.modeChipActive]}
          onPress={() => setMode('city_explorer')}
        >
          <Text style={[styles.modeChipText, mode === 'city_explorer' && styles.modeChipTextActive]}>
            City Explorer
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'drive_discovery' && styles.modeChipActive]}
          onPress={() => setMode('drive_discovery')}
        >
          <Text style={[styles.modeChipText, mode === 'drive_discovery' && styles.modeChipTextActive]}>
            Drive Discovery
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'city_explorer' && (
        <View style={styles.walkingBox}>
          <Text style={styles.walkingTitle}>Пешеходный режим</Text>
          <Text style={styles.walkingText}>
            City Explorer остается основным режимом MVP. Экран готов для backend-driven
            DiscoveryTarget и не запускает Drive Discovery сессию.
          </Text>
        </View>
      )}

      {mode === 'drive_discovery' && (
        <>
          <TouchableOpacity
            style={styles.settingsTrigger}
            onPress={() => setSettingsOpen(!settingsOpen)}
          >
            <Text style={styles.settingsTriggerText}>
              {settingsOpen ? 'Скрыть настройки' : 'Настройки Drive Discovery'}
            </Text>
          </TouchableOpacity>

          {settingsOpen && (
            <View style={styles.settingsBox}>
              <Text style={styles.settingsLabel}>Тематики</Text>
              <View style={styles.chipRow}>
                {THEME_TAGS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, themes.includes(t) && styles.chipActive]}
                    onPress={() => toggleTheme(t)}
                  >
                    <Text style={[styles.chipText, themes.includes(t) && styles.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.settingsLabel}>Стиль: {style}</Text>
              <View style={styles.chipRow}>
                {STYLES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, style === s && styles.chipActive]}
                    onPress={() => setStyle(s)}
                  >
                    <Text style={[styles.chipText, style === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.settingsLabel}>Длина: {lengthSec} сек</Text>
              <Text style={styles.settingsLabel}>Начинать за: {leadTimeMin} мин до подъезда</Text>
              <View style={styles.row}>
                <Text style={styles.settingsLabel}>Авто-плей</Text>
                <Switch value={autoplay} onValueChange={setAutoplay} />
              </View>
            </View>
          )}

          {sessionError && (
            <Text style={styles.errorText}>{sessionError}</Text>
          )}

          {!sessionId ? (
            <StoryPanel
              presentation={presentation}
              actions={
                <LiveControls
                  presentation={presentation}
                  muted={muted}
                  sessionActive={false}
                  onStartSession={startSession}
                  onEndSession={stopSession}
                  onPausePlayback={pausePlayback}
                  onResumePlayback={resumePlayback}
                  onSkipStory={() => void finishStory('skipped')}
                  onToggleMute={() => setMuted(!muted)}
                />
              }
            />
          ) : (
            <>
              <LiveStatusPill presentation={presentation} />
              <View style={styles.panelWrap}>
                <StoryPanel
                  presentation={presentation}
                  actions={
                    <LiveControls
                      presentation={presentation}
                      muted={muted}
                      sessionActive
                      onStartSession={startSession}
                      onEndSession={stopSession}
                      onPausePlayback={pausePlayback}
                      onResumePlayback={resumePlayback}
                      onSkipStory={() => void finishStory('skipped')}
                      onToggleMute={() => setMuted(!muted)}
                    />
                  }
                />
              </View>
              {lastResult?.estimatedDurationSec && (
                <Text style={styles.playingLabel}>
                  Estimated story length: {lastResult.estimatedDurationSec} sec
                </Text>
              )}
              {lastMotion && (
                <Text style={styles.motionLabel}>
                  Speed {lastMotion.speedKmh.toFixed(1)} km/h · Heading {Math.round(lastMotion.heading)}°
                </Text>
              )}
              {lastResult?.circuitLimited && (
                <Text style={styles.warnText}>Временно ограничено (лимиты API)</Text>
              )}
            </>
          )}
        </>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40 },
  screenTitle: {
    ...typography.title,
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  modeRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  modeChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  modeChipActive: { backgroundColor: colors.foreground },
  modeChipText: { color: colors.textMuted, fontSize: 14 },
  modeChipTextActive: { color: colors.surface },
  walkingBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  walkingTitle: {
    ...typography.label,
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  walkingText: {
    ...typography.body,
    color: colors.textMuted,
  },
  settingsTrigger: { marginBottom: 12 },
  settingsTriggerText: { color: colors.foreground, fontSize: 14 },
  settingsBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 20,
  },
  settingsLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: { backgroundColor: colors.arthur },
  chipText: { color: colors.textMuted, fontSize: 12 },
  chipTextActive: { color: colors.surface },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  panelWrap: { marginTop: spacing.md },
  playingLabel: { marginTop: 12, color: colors.textMuted, fontSize: 14 },
  motionLabel: { marginTop: 8, color: colors.textMuted, fontSize: 12 },
  errorText: { marginBottom: spacing.md, color: colors.danger, fontSize: 13 },
  warnText: { marginTop: 8, color: colors.warning, fontSize: 12 },
});
