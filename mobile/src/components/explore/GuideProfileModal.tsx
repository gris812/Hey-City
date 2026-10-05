import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { resolveGuideSwipe, shouldCaptureGuideSwipe } from '../../features/guides/guideProfileInteraction';

export type FullGuideProfile = {
  image: ImageSourcePropType;
  imageResizeMode?: 'cover' | 'contain';
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
  voiceLoadingLabel: string;
  voicePlayingLabel: string;
  voiceErrorLabel: string;
  voiceRetryLabel: string;
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

export function GuideProfileModal({
  visible,
  topInset,
  initialGuideId,
  profiles,
  backLabel,
  backToGuidesLabel,
  voiceSampleLabel,
  voicePlaceholderLabel,
  voiceLoadingLabel,
  voicePlayingLabel,
  voiceErrorLabel,
  voiceRetryLabel,
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
  const stopRef = useRef(onStopVoiceSample);
  const wasVisibleRef = useRef(false);
  const initialGuideRef = useRef(initialGuideId);

  stopRef.current = onStopVoiceSample;

  useEffect(() => {
    const opening = visible && !wasVisibleRef.current;
    const closing = !visible && wasVisibleRef.current;
    const requestedGuideChanged = visible && initialGuideRef.current !== initialGuideId;

    if (opening || requestedGuideChanged) {
      if (requestedGuideChanged) void stopRef.current();
      setActiveGuideId(initialGuideId);
      setSampleOpen(false);
    }
    if (closing) void stopRef.current();

    wasVisibleRef.current = visible;
    initialGuideRef.current = initialGuideId;
  }, [initialGuideId, visible]);

  useEffect(() => () => {
    void stopRef.current();
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          shouldCaptureGuideSwipe(gesture.dx, gesture.dy),
        onMoveShouldSetPanResponder: (_, gesture) =>
          shouldCaptureGuideSwipe(gesture.dx, gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gesture) => {
          const nextGuide = resolveGuideSwipe(activeGuideId, gesture.dx, gesture.dy);
          if (nextGuide === activeGuideId) return;
          void stopRef.current();
          setActiveGuideId(nextGuide);
          setSampleOpen(false);
        },
      }),
    [activeGuideId]
  );

  const profile = profiles[activeGuideId];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        void stopRef.current();
        onBack();
      }}
    >
      <View style={styles.screen} {...panResponder.panHandlers}>
        <View style={[styles.imageStage, { paddingTop: Math.max(0, topInset) }]}>
          <View style={styles.imageFrame}>
            <Image source={profile.image} style={styles.image} resizeMode={profile.imageResizeMode ?? 'cover'} />
          </View>
          <View style={[styles.topBar, { top: Math.max(0, topInset) + spacing.sm }]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              style={styles.backButton}
              onPress={() => {
                void stopRef.current();
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
            <Text style={styles.pageIndex}>{activeGuideId === 'dana' ? 1 : 2} / 2</Text>
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
              if (voicePreviewState === 'playing') void stopRef.current();
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
                  ? voiceLoadingLabel
                  : voicePreviewState === 'playing'
                    ? voicePlayingLabel
                    : voicePreviewState === 'error'
                      ? voiceErrorLabel
                      : voicePlaceholderLabel}
              </Text>
            </View>
          </TouchableOpacity>
          {sampleOpen && voicePreviewState !== 'error' && (
            <Text style={styles.voiceTranscript}>{profile.voiceGreeting}</Text>
          )}
          {voicePreviewState === 'error' && (
            <View style={styles.voiceErrorBox}>
              <Text style={styles.voiceErrorText}>{voicePreviewError || voiceErrorLabel}</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.voiceRetryButton} onPress={onRetryVoiceSample}>
                <Text style={styles.voiceRetryText}>{voiceRetryLabel}</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.chooseButton} onPress={() => {
              void stopRef.current();
              onChoose(activeGuideId);
            }}>
              <Text style={styles.chooseText}>{profile.chooseLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.guidesButton} onPress={() => {
              void stopRef.current();
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
