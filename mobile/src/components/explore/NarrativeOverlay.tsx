import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { useAppTranslation } from '../../localization';

export type NarrativeOverlayProps = {
  title: string;
  guideName: string;
  text: string;
  playbackState: 'idle' | 'playing' | 'paused' | 'completed';
  progress?: number;
  autoContinueRemainingMs?: number;
  onPause: () => void;
  onResume: () => void;
  onContinue: () => void;
  onTranscript?: () => void;
};

export function NarrativeOverlay({
  title,
  guideName,
  text,
  playbackState,
  progress,
  autoContinueRemainingMs,
  onPause,
  onResume,
  onContinue,
  onTranscript,
}: NarrativeOverlayProps) {
  const { t } = useAppTranslation();
  const paused = playbackState === 'paused';

  return (
    <View style={styles.overlay}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View>
            <Text style={styles.guide}>{guideName}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          {typeof progress === 'number' && (
            <Text style={styles.progress}>{Math.round(progress * 100)}%</Text>
          )}
        </View>

        <ScrollView style={styles.textScroll}>
          <Text style={styles.body}>{text}</Text>
        </ScrollView>

        {typeof autoContinueRemainingMs === 'number' && (
          <Text style={styles.countdown}>
            {t('tour.autoContinue')}: {Math.ceil(autoContinueRemainingMs / 1000)}s
          </Text>
        )}

        <View style={styles.controls}>
          <TouchableOpacity style={styles.secondaryButton} onPress={paused ? onResume : onPause}>
            <Text style={styles.secondaryText}>{paused ? t('tour.resume') : t('tour.pause')}</Text>
          </TouchableOpacity>
          {onTranscript && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onTranscript}>
              <Text style={styles.secondaryText}>Transcript</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.primaryButton} onPress={onContinue}>
            <Text style={styles.primaryText}>{t('tour.continue')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    padding: spacing.md,
    zIndex: 10,
  },
  panel: {
    maxHeight: 340,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,253,248,0.94)',
    padding: spacing.md,
    shadowColor: colors.foreground,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  guide: { ...typography.caption, color: colors.textMuted },
  title: { ...typography.body, color: colors.foreground, fontWeight: '700', marginTop: 2 },
  progress: { ...typography.caption, color: colors.textMuted },
  textScroll: { maxHeight: 140, marginVertical: spacing.sm },
  body: { ...typography.body, color: colors.foreground },
  countdown: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  controls: { flexDirection: 'row', gap: spacing.sm },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { ...typography.caption, color: colors.foreground },
  primaryText: { ...typography.caption, color: colors.surface },
});
