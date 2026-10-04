import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import type { GuidePreference } from '../../localization/preferences';

export type FullGuideProfile = {
  image: ImageSourcePropType;
  name: string;
  role: string;
  body: string;
  interests: string[];
  quote: string;
  chooseLabel: string;
  voiceGreeting: string;
};

export type GuideProfileModalProps = {
  visible: boolean;
  topInset: number;
  initialGuideId: GuidePreference;
  profiles: Record<GuidePreference, FullGuideProfile>;
  backLabel: string;
  backToGuidesLabel: string;
  voiceSampleLabel: string;
  voicePlaceholderLabel: string;
  swipeLabel: string;
  voicePreviewState: 'idle' | 'loading' | 'playing' | 'error';
  voicePreviewError?: string | null;
  onVoiceSample: (guideId: GuidePreference) => void;
  onRetryVoiceSample: () => void;
  onStopVoiceSample: () => void;
  onChoose: (guideId: GuidePreference) => void;
  onBack: () => void;
  onBackToGuides: () => void;
};

const guideOrder: GuidePreference[] = ['dana', 'arthur'];

export function GuideProfileModal({
  visible,
  topInset,
  initialGuideId,
  profiles,
  backLabel,
  backToGuidesLabel,
  voiceSampleLabel,
  voicePlaceholderLabel,
  swipeLabel,
  voicePreviewState,
  voicePreviewError,
  onVoiceSample,
  onRetryVoiceSample,
  onStopVoiceSample,
  onChoose,
  onBack,
  onBackToGuides,
}: GuideProfileModalProps) {
  const [activeGuideId, setActiveGuideId] = useState<GuidePreference>(initialGuideId);
  const [sampleOpen, setSampleOpen] = useState(false);

  useEffect(() => {
    if (!visible) {
      onStopVoiceSample();
      return;
    }
    setActiveGuideId(initialGuideId);
    setSampleOpen(false);
    onStopVoiceSample();
  }, [initialGuideId, visible, onStopVoiceSample]);

  const switchGuide = (direction: -1 | 1) => {
    const currentIndex = guideOrder.indexOf(activeGuideId);
    const nextIndex = (currentIndex + direction + guideOrder.length) % guideOrder.length;
    onStopVoiceSample();
    setActiveGuideId(guideOrder[nextIndex]);
    setSampleOpen(false);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx <= -48) switchGuide(1);
          if (gesture.dx >= 48) switchGuide(-1);
        },
      }),
    [activeGuideId]
  );

  const profile = profiles[activeGuideId];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onBack}>
      <View style={styles.screen} {...panResponder.panHandlers}>
        <View style={[styles.imageStage, { paddingTop: Math.max(0, topInset) }]}>
          <View style={styles.imageFrame}>
            <Image source={profile.image} style={styles.image} resizeMode="cover" />
          </View>
          <View style={[styles.topBar, { top: Math.max(0, topInset) + spacing.sm }]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              style={styles.backButton}
              onPress={() => {
                onStopVoiceSample();
                onBack();
              }}
            >
              <Text style={styles.backGlyph}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.swipeHint}>{swipeLabel}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.editorialPanel}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator
        >
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.role}>{profile.role}</Text>
            </View>
            <Text style={styles.pageIndex}>{guideOrder.indexOf(activeGuideId) + 1} / {guideOrder.length}</Text>
          </View>

          <Text style={styles.body}>{profile.body}</Text>
          <Text style={styles.interests}>{profile.interests.join('  ·  ')}</Text>
          <Text style={styles.quote}>“{profile.quote}”</Text>

          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.voiceButton, voicePreviewState === 'error' && styles.voiceButtonError]}
            disabled={voicePreviewState === 'loading'}
            onPress={() => {
              setSampleOpen(true);
              if (voicePreviewState === 'playing') onStopVoiceSample();
              else onVoiceSample(activeGuideId);
            }}
          >
            {voicePreviewState === 'loading' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.voiceIcon}>{voicePreviewState === 'playing' ? '■' : '▶'}</Text>
            )}
            <View style={styles.voiceCopy}>
              <Text style={styles.voiceTitle}>{voiceSampleLabel}</Text>
              <Text style={styles.voiceMeta}>
                {voicePreviewState === 'loading'
                  ? 'Loading voice sample…'
                  : voicePreviewState === 'playing'
                    ? 'Playing · tap to stop'
                    : voicePreviewState === 'error'
                      ? 'Voice sample unavailable'
                      : voicePlaceholderLabel}
              </Text>
            </View>
          </TouchableOpacity>
          {sampleOpen && voicePreviewState !== 'error' && (
            <Text style={styles.voiceTranscript}>{profile.voiceGreeting}</Text>
          )}
          {voicePreviewState === 'error' && (
            <View style={styles.voiceErrorBox}>
              <Text style={styles.voiceErrorText}>{voicePreviewError || 'Voice sample could not be played.'}</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.voiceRetryButton} onPress={onRetryVoiceSample}>
                <Text style={styles.voiceRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.chooseButton} onPress={() => {
              onStopVoiceSample();
              onChoose(activeGuideId);
            }}>
              <Text style={styles.chooseText}>{profile.chooseLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.guidesButton} onPress={() => {
              onStopVoiceSample();
              onBackToGuides();
            }}>
              <Text style={styles.guidesText}>{backToGuidesLabel}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  imageStage: { height: '46%', backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  imageFrame: { flex: 1, marginHorizontal: spacing.sm, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  image: { width: '100%', height: '100%' },
  topBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(11,23,17,0.16)',
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { color: colors.foreground, fontSize: 32, lineHeight: 34, fontWeight: '500' },
  swipeHint: {
    ...typography.caption,
    color: colors.foreground,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(11,23,17,0.12)',
    borderRadius: radius.sm,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  editorialPanel: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 48, gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  titleCopy: { flex: 1 },
  name: { color: colors.foreground, fontSize: 38, lineHeight: 42, fontWeight: '700', letterSpacing: -0.8 },
  role: { ...typography.label, color: colors.primary, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  pageIndex: { fontFamily: 'Courier', fontSize: 12, lineHeight: 16, color: colors.textMuted, marginTop: 8 },
  body: { ...typography.body, color: colors.foreground, fontSize: 17, lineHeight: 24 },
  interests: {
    ...typography.caption,
    color: colors.foreground,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
  },
  quote: { ...typography.body, color: colors.textMuted, fontStyle: 'italic' },
  voiceButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.foreground,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  voiceButtonError: { borderColor: colors.danger },
  voiceIcon: { color: colors.primary, fontSize: 16, lineHeight: 20 },
  voiceCopy: { flex: 1 },
  voiceTitle: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  voiceMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  voiceTranscript: {
    ...typography.caption,
    color: colors.foreground,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.md,
  },
  voiceErrorBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  voiceErrorText: { ...typography.caption, color: colors.danger },
  voiceRetryButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  voiceRetryText: { ...typography.caption, color: colors.foreground, fontWeight: '700' },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  chooseButton: {
    minHeight: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseText: { ...typography.body, color: colors.surface, fontWeight: '700' },
  guidesButton: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidesText: { ...typography.body, color: colors.foreground, fontWeight: '600' },
});
