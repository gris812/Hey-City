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

function getDiscoveryStatus(result: PingResult | null): string {
  if (!result?.decision) return 'Ожидание данных маршрута';
  if (result.decision.type === 'trigger_story') {
    const eta = result.decision.etaSeconds
      ? `ETA ${Math.round(result.decision.etaSeconds)} sec`
      : 'distance trigger';
    return `Story trigger: ${result.decision.triggerReason} · ${eta}`;
  }

  const labels: Record<typeof result.decision.reason, string> = {
    speed_too_low: 'Ожидание движения в авто',
    cooldown_active: 'Пауза между историями',
    already_listening: 'История активна',
    no_candidate: 'Подходящих POI рядом нет',
    anti_repeat: 'POI уже недавно звучал',
    bad_gps: 'GPS-данные устарели',
    budget_guardrail: 'Временно ограничено бюджетным guardrail',
  };
  return labels[result.decision.reason];
}

function getTranscriptPreview(result: PingResult | null): string | null {
  const text = result?.transcriptText ?? result?.textPreview;
  if (!text) return null;
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export function LiveScreen() {
  const [mode, setMode] = useState<'quick_facts' | 'drive_discovery'>('quick_facts');
  const [driveDiscoveryOn, setDriveDiscoveryOn] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themes, setThemes] = useState<string[]>(['mixed']);
  const [style, setStyle] = useState('documentary');
  const [lengthSec, setLengthSec] = useState(90);
  const [leadTimeMin, setLeadTimeMin] = useState(2);
  const [autoplay, setAutoplay] = useState(true);
  const [muted, setMuted] = useState(false);
  const [lastResult, setLastResult] = useState<PingResult | null>(null);
  const [playingName, setPlayingName] = useState<string | null>(null);
  const [lastMotion, setLastMotion] = useState<{ speedKmh: number; heading: number } | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const profileRef = useRef<Awaited<ReturnType<typeof getProfile>> | null>(null);
  const lastHeadingRef = useRef(0);

  const startSession = useCallback(async () => {
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
    } catch (e) {
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
          if (result.audioUrl) {
            // TODO: play audio with expo-av
          }
        } else if (result.decision?.type !== 'hold' || result.decision.reason !== 'already_listening') {
          setPlayingName(null);
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
    try {
      const result = await finishDriveStory(sessionId, reason);
      setPlayingName(null);
      setLastResult({
        nextAction: 'NONE',
        decision: {
          type: 'hold',
          reason: result.activeStoryWasPlaying ? 'cooldown_active' : 'no_candidate',
        },
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>Режим в авто</Text>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'quick_facts' && styles.modeChipActive]}
          onPress={() => setMode('quick_facts')}
        >
          <Text style={[styles.modeChipText, mode === 'quick_facts' && styles.modeChipTextActive]}>
            Quick Facts
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

          {!sessionId ? (
            <TouchableOpacity style={styles.primaryButton} onPress={startSession}>
              <Text style={styles.primaryButtonText}>Старт Drive Discovery</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.controlsRow}>
                <TouchableOpacity
                  style={[styles.controlBtn, muted && styles.controlBtnActive]}
                  onPress={() => setMuted(!muted)}
                >
                  <Text style={styles.controlBtnText}>{muted ? 'Unmute' : 'Mute'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.controlBtn}
                  onPress={() => void finishStory('paused')}
                >
                  <Text style={styles.controlBtnText}>Pause</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.controlBtn}
                  onPress={() => void finishStory('skipped')}
                >
                  <Text style={styles.controlBtnText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlBtn}>
                  <Text style={styles.controlBtnText}>Подробнее позже</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.stopButton} onPress={stopSession}>
                <Text style={styles.stopButtonText}>Остановить сессию</Text>
              </TouchableOpacity>
              {playingName && (
                <Text style={styles.playingLabel}>Сейчас: {playingName}</Text>
              )}
              {lastResult && (
                <View style={styles.storyStateBox}>
                  <Text style={styles.storyStateText}>{getDiscoveryStatus(lastResult)}</Text>
                  {lastResult.estimatedDurationSec && (
                    <Text style={styles.storyMetaText}>
                      {lastResult.estimatedDurationSec} sec · {lastResult.narrativePlan?.guideId ?? 'guide'}
                    </Text>
                  )}
                  {getTranscriptPreview(lastResult) && (
                    <Text style={styles.transcriptPreview}>{getTranscriptPreview(lastResult)}</Text>
                  )}
                </View>
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

      {mode === 'quick_facts' && (
        <Text style={styles.placeholder}>Quick Facts — в разработке</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: { padding: 20, paddingBottom: 40 },
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#eee', marginBottom: 16 },
  modeRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  modeChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#16213e',
  },
  modeChipActive: { backgroundColor: '#e94560' },
  modeChipText: { color: '#888', fontSize: 14 },
  modeChipTextActive: { color: '#fff' },
  settingsTrigger: { marginBottom: 12 },
  settingsTriggerText: { color: '#e94560', fontSize: 14 },
  settingsBox: { backgroundColor: '#16213e', borderRadius: 12, padding: 16, marginBottom: 20 },
  settingsLabel: { color: '#aaa', fontSize: 12, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#0f3460' },
  chipActive: { backgroundColor: '#e94560' },
  chipText: { color: '#888', fontSize: 12 },
  chipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  primaryButton: { backgroundColor: '#e94560', borderRadius: 12, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  controlsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  controlBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#16213e' },
  controlBtnActive: { backgroundColor: '#0f3460' },
  controlBtnText: { color: '#eee', fontSize: 14 },
  stopButton: { paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e94560', alignItems: 'center' },
  stopButtonText: { color: '#e94560', fontSize: 14 },
  playingLabel: { marginTop: 12, color: '#aaa', fontSize: 14 },
  storyStateBox: { marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: '#16213e' },
  storyStateText: { color: '#eee', fontSize: 13, lineHeight: 18 },
  storyMetaText: { marginTop: 6, color: '#aaa', fontSize: 12 },
  transcriptPreview: { marginTop: 8, color: '#bbb', fontSize: 12, lineHeight: 18 },
  motionLabel: { marginTop: 8, color: '#666', fontSize: 12 },
  warnText: { marginTop: 8, color: '#f0a030', fontSize: 12 },
  placeholder: { color: '#666', fontSize: 14 },
});
