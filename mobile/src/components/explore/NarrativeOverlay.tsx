import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { useAppTranslation } from '../../localization';

export type NarrativeOverlayProps = {
  title: string;
  guideName: string;
  guideImage?: ImageSourcePropType;
  text: string;
  playbackState: 'idle' | 'playing' | 'paused' | 'completed';
  progress?: number;
  autoContinueRemainingMs?: number;
  onPause: () => void;
  onResume: () => void;
  onContinue: () => void;
  continueLabel?: string;
  onSkip?: () => void;
  onTranscript?: () => void;
};

export function NarrativeOverlay({
  title,
  guideName,
  guideImage,
  text,
  playbackState,
  progress,
  autoContinueRemainingMs,
  onPause,
  onResume,
  onContinue,
  continueLabel,
  onSkip,
  onTranscript,
}: NarrativeOverlayProps) {
  const { t } = useAppTranslation();
  const paused = playbackState === 'paused';
  const completed = playbackState === 'completed';

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.panel}>
        <View style={styles.compactWaveform} accessibilityElementsHidden>
          {[6, 12, 8, 15, 10, 13, 7].map((height, index) => (
            <View
              key={`${height}-${index}`}
              style={[
                styles.compactWaveBar,
                { height },
                (paused || completed) && styles.waveBarInactive,
              ]}
            />
          ))}
        </View>
        <View style={styles.header}>
          {guideImage ? <Image source={guideImage} style={styles.guideAvatar} /> : null}
          <View style={styles.headerCopy}>
            <Text style={styles.guide}>
              {t('walking.guideSpeaking').replace('{guide}', guideName)}
            </Text>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
          </View>
        </View>

        <ScrollView style={styles.textScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.body}>{text}</Text>
        </ScrollView>

        {typeof progress === 'number' && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} />
          </View>
        )}

        {typeof autoContinueRemainingMs === 'number' && (
          <Text style={styles.countdown}>
            {t('tour.autoContinue')}: {Math.ceil(autoContinueRemainingMs / 1000)}s
          </Text>
        )}

        <View style={styles.controls}>
          {!completed && (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.playbackButton}
              onPress={paused ? onResume : onPause}
            >
              <Text style={styles.playbackGlyph}>{paused ? '▶' : 'Ⅱ'}</Text>
              <Text style={styles.playbackText}>{paused ? t('tour.resume') : t('tour.pause')}</Text>
            </TouchableOpacity>
          )}
          {onTranscript && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onTranscript}>
              <Text style={styles.secondaryText}>{t('walking.transcript')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.primaryButton} onPress={onContinue}>
            <Text style={styles.primaryText}>{continueLabel ?? t('tour.continue')}</Text>
          </TouchableOpacity>
        </View>

        {onSkip && !completed && (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipText}>{t('walking.skipStory')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: spacing.sm,
    zIndex: 40,
  },
  panel: {
    maxHeight: 360,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.98)',
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: spacing.md,
    ...shadows.floating,
  },
  compactWaveform: {
    alignSelf: 'center',
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 8,
  },
  compactWaveBar: { width: 3, borderRadius: 1.5, backgroundColor: colors.primaryBright },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: spacing.sm,
  },
  guideAvatar: { width: 48, height: 48, borderRadius: 24 },
  headerCopy: { flex: 1, minWidth: 0 },
  guide: { ...typography.caption, color: colors.primary },
  title: { ...typography.body, color: colors.foreground, fontWeight: '700', marginTop: 2 },
  textScroll: { maxHeight: 112, marginVertical: spacing.sm },
  body: { ...typography.body, color: colors.foreground },
  countdown: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  waveBarInactive: { backgroundColor: colors.border },
  progressTrack: {
    height: 4,
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.md,
  },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.primary },
  controls: { flexDirection: 'row', gap: spacing.sm },
  playbackButton: {
    flex: 1.15,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  playbackGlyph: { color: colors.surface, fontSize: 16, lineHeight: 18, fontWeight: '800' },
  playbackText: { ...typography.caption, color: colors.surface, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { ...typography.caption, color: colors.foreground },
  primaryText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  skipButton: { alignSelf: 'center', paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 2 },
  skipText: { ...typography.caption, color: colors.textMuted },
});
