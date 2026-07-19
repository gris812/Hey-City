import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { useAppTranslation } from '../../localization';
import {
  analyzeLocationEvent,
  continueToNextTarget,
  createInitialGuidedTourState,
  getCurrentTarget,
  startGuidedTour,
  tourBLocationEvents,
  type GuidedTourState,
} from '../../demo/guidedTour';
import { useAuth } from '../../context/AuthContext';
import { tourBTargets } from '../../demo/tours';

const firstTimestampMs = tourBLocationEvents[0]?.timestampMs ?? 0;

export function LocationSimulationPanel() {
  const { t } = useAppTranslation();
  const { preferences } = useAuth();
  const [state, setState] = useState<GuidedTourState>(() =>
    createInitialGuidedTourState(preferences.preferredGuideId, preferences.guideLanguage)
  );
  const [eventIndex, setEventIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    if (!running || paused) return;
    const event = tourBLocationEvents[eventIndex];
    if (!event) {
      setRunning(false);
      return;
    }

    const timer = setTimeout(() => {
      setState((current) => {
        const next = analyzeLocationEvent(current, event);
        if (next.journeyState === 'arrived') return continueToNextTarget(next);
        return next;
      });
      setEventIndex((index) => index + 1);
    }, 700 / playbackSpeed);

    return () => clearTimeout(timer);
  }, [eventIndex, paused, playbackSpeed, running]);

  const currentTarget = getCurrentTarget(state);
  const elapsedSec = state.location
    ? Math.max(0, Math.round((state.location.timestampMs - firstTimestampMs) / 1000))
    : 0;

  const start = () => {
    setState(startGuidedTour(createInitialGuidedTourState(preferences.preferredGuideId, preferences.guideLanguage)));
    setEventIndex(0);
    setPaused(false);
    setRunning(true);
  };

  const stop = () => {
    setRunning(false);
    setPaused(false);
    setEventIndex(0);
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{t('sim.title')}</Text>
      <Text style={styles.label}>{t('sim.scenario')}</Text>
      <Text style={styles.value}>Tour B — World Trade Center & Waterfront</Text>
      <Text style={styles.hint}>{t('sim.routingUnavailable')}</Text>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.button} onPress={start}>
          <Text style={styles.buttonText}>{t('sim.start')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => setPaused((value) => !value)} disabled={!running}>
          <Text style={styles.buttonText}>{paused ? t('sim.resume') : t('sim.pause')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={stop} disabled={!running}>
          <Text style={styles.buttonText}>{t('sim.stop')}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>{t('sim.playbackSpeed')}</Text>
      <View style={styles.controls}>
        {[0.5, 1, 2].map((speed) => (
          <TouchableOpacity
            key={speed}
            style={[styles.speedButton, playbackSpeed === speed && styles.speedButtonActive]}
            onPress={() => setPlaybackSpeed(speed)}
          >
            <Text style={styles.speedText}>{speed}x</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.metricGrid}>
        <Text style={styles.metric}>
          {t('sim.coordinate')}: {state.location ? `${state.location.latitude.toFixed(6)}, ${state.location.longitude.toFixed(6)}` : '-'}
        </Text>
        <Text style={styles.metric}>{t('sim.heading')}: {state.location ? Math.round(state.location.heading) : '-'}</Text>
        <Text style={styles.metric}>{t('sim.speed')}: {state.location ? state.location.speedKmh.toFixed(1) : '-'}</Text>
        <Text style={styles.metric}>{t('sim.elapsed')}: {elapsedSec}s</Text>
        <Text style={styles.metric}>{t('tour.currentTarget')}: {currentTarget?.name ?? '-'}</Text>
        <Text style={styles.metric}>
          {t('tour.distance')}: {typeof state.distanceToCurrentTargetMeters === 'number' ? `${Math.round(state.distanceToCurrentTargetMeters)} m` : '-'}
        </Text>
        <Text style={styles.metric}>{t('tour.state')}: {t(`journey.${state.journeyState}`)}</Text>
        <Text style={styles.metric}>
          {t('sim.completedTargets')}: {state.completedTargetIds.map((id) => tourBTargets.find((target) => target.id === id)?.name).filter(Boolean).join(', ') || '-'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  title: { ...typography.label, color: colors.foreground },
  label: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.body, color: colors.foreground },
  hint: { ...typography.caption, color: colors.textMuted },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.foreground,
  },
  buttonText: { ...typography.caption, color: colors.surface },
  speedButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  speedButtonActive: { backgroundColor: colors.dana },
  speedText: { ...typography.caption, color: colors.foreground },
  metricGrid: { gap: spacing.xs },
  metric: { ...typography.caption, color: colors.foreground },
});
