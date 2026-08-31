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
        <View style={styles.handle} />
        <View style={styles.header}>
          {guideImage ? <Image source={guideImage} style={styles.guideAvatar} /> : null}
          <View style={styles.headerCopy}>
            <Text style={styles.guide}>
              {t('walking.guideSpeaking').replace('{guide}', guideName)}
            </Text>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={[styles.liveDot, paused && styles.liveDotPaused]} />
            <Text style={styles.liveText}>{paused ? t('tour.pause') : t('walking.live')}</Text>
          </View>
        </View>

        <ScrollView style={styles.textScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.body}>{text}</Text>
        </ScrollView>

        <View style={styles.waveformRow} accessibilityElementsHidden>
          {[12, 20, 14, 28, 18, 32, 22, 16, 26, 14, 20, 12].map((height, index) => (
            <View
              key={`${height}-${index}`}
              style={[
                styles.waveBar,
                { height },
                (paused || completed) && styles.waveBarInactive,
              ]}
            />
          ))}
        </View>

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
    maxHeight: 420,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.98)',
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: spacing.md,
    ...shadows.floating,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primaryBright },
  liveDotPaused: { backgroundColor: colors.warning },
  liveText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  textScroll: { maxHeight: 112, marginVertical: spacing.sm },
  body: { ...typography.body, color: colors.foreground },
  countdown: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  waveformRow: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginVertical: spacing.sm,
  },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: colors.primaryBright },
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
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  playbackGlyph: { color: colors.surface, fontSize: 16, lineHeight: 18, fontWeight: '800' },
  playbackText: { ...typography.caption, color: colors.surface, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { ...typography.caption, color: colors.foreground },
  primaryText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  skipButton: { alignSelf: 'center', paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 2 },
  skipText: { ...typography.caption, color: colors.textMuted },
});
