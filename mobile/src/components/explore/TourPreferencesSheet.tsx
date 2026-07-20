import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import type { GuidePreference, SupportedLocale } from '../../localization/preferences';

export type GuideProfileSummary = {
  role: string;
};

export type TourPreferencesSheetProps = {
  visible: boolean;
  topInset: number;
  guideIds: GuidePreference[];
  selectedGuideId: GuidePreference;
  selectedLanguage: SupportedLocale;
  selectedInterests: string[];
  interestOptions: string[];
  guideImages: Record<GuidePreference, ImageSourcePropType>;
  guideProfiles: Record<GuidePreference, GuideProfileSummary>;
  tourTitle: string;
  routeMeta: string;
  startWalkLabel: string;
  moreSettingsLabel: string;
  selectedLabel: string;
  chooseGuideLabel: (guideId: GuidePreference) => string;
  previewGuideLabel: (guideId: GuidePreference) => string;
  getGuideName: (guideId: GuidePreference) => string;
  getLanguageName: (locale: SupportedLocale) => string;
  onSelectGuide: (guideId: GuidePreference) => void;
  onOpenGuidePreview: (guideId: GuidePreference) => void;
  onToggleInterest: (interest: string) => void;
  onSelectLanguage: (locale: SupportedLocale) => void;
  onStartWalk: () => void;
  onMoreSettings: () => void;
};

export function TourPreferencesSheet({
  visible,
  topInset,
  guideIds,
  selectedGuideId,
  selectedLanguage,
  selectedInterests,
  interestOptions,
  guideImages,
  guideProfiles,
  tourTitle,
  routeMeta,
  startWalkLabel,
  moreSettingsLabel,
  selectedLabel,
  chooseGuideLabel,
  previewGuideLabel,
  getGuideName,
  getLanguageName,
  onSelectGuide,
  onOpenGuidePreview,
  onToggleInterest,
  onSelectLanguage,
  onStartWalk,
  onMoreSettings,
}: TourPreferencesSheetProps) {
  return (
    <Modal visible={visible} animationType="slide">
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: topInset + spacing.lg }]}>
        <Text style={styles.title}>Start your walk</Text>
        <Text style={styles.subtitle}>Choose your guide, interests and language. Defaults work if you skip this.</Text>

        <View style={styles.guideRow}>
          {guideIds.map((guideId) => {
            const selected = selectedGuideId === guideId;
            return (
              <TouchableOpacity
                key={guideId}
                style={[styles.guideCard, selected && styles.guideCardSelected]}
                accessibilityLabel={`${previewGuideLabel(guideId)}. ${getGuideName(guideId)}, ${guideProfiles[guideId].role}. ${selected ? selectedLabel : ''}`}
                accessibilityRole="button"
                onPress={() => onOpenGuidePreview(guideId)}
              >
                <Image source={guideImages[guideId]} style={styles.guideImage} resizeMode="cover" />
                <Text style={styles.guideName}>{getGuideName(guideId)}</Text>
                <Text style={styles.guideRole}>{guideProfiles[guideId].role}</Text>
                {selected && <Text style={styles.check}>✓</Text>}
                <TouchableOpacity
                  style={styles.guideChooseButton}
                  accessibilityLabel={chooseGuideLabel(guideId)}
                  onPress={() => onSelectGuide(guideId)}
                >
                  <Text style={styles.guideChooseText}>{selected ? selectedLabel : chooseGuideLabel(guideId)}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionHeading}>Interests - choose up to 3</Text>
        <View style={styles.chipRow}>
          {interestOptions.map((interest) => {
            const selected = selectedInterests.includes(interest);
            return (
              <TouchableOpacity
                key={interest}
                style={[styles.chip, selected && styles.chipActive]}
                accessibilityLabel={`${selected ? 'Remove' : 'Select'} ${interest}`}
                onPress={() => onToggleInterest(interest)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{interest}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!selectedInterests.length && (
          <Text style={styles.preferenceHint}>
            No interests selected. We will use {getGuideName(selectedGuideId)}'s recommended mix.
          </Text>
        )}

        <Text style={styles.sectionHeading}>Language</Text>
        <View style={styles.languageRow}>
          {(['en', 'ru'] as SupportedLocale[]).map((locale) => (
            <TouchableOpacity
              key={locale}
              style={[styles.languageButton, selectedLanguage === locale && styles.languageButtonActive]}
              accessibilityLabel={`Select ${getLanguageName(locale)}`}
              onPress={() => onSelectLanguage(locale)}
            >
              <Text style={[styles.languageButtonText, selectedLanguage === locale && styles.languageButtonTextActive]}>
                {getLanguageName(locale)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.routeSummaryCard}>
          <Text style={styles.routeSummaryTitle}>{tourTitle}</Text>
          <Text style={styles.routeSummaryMeta}>{routeMeta}</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={onStartWalk}>
          <Text style={styles.primaryText}>{startWalkLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.plainButton} onPress={onMoreSettings}>
          <Text style={styles.plainButtonText}>{moreSettingsLabel}</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 64, gap: spacing.md },
  title: { ...typography.title, color: colors.foreground, fontSize: 30, lineHeight: 36 },
  subtitle: { ...typography.body, color: colors.textMuted },
  sectionHeading: { ...typography.label, color: colors.foreground },
  guideRow: { flexDirection: 'row', gap: spacing.sm },
  guideCard: {
    flex: 1,
    minHeight: 190,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    position: 'relative',
  },
  guideCardSelected: {
    borderWidth: 2,
    borderColor: colors.primaryOrange,
    backgroundColor: colors.primaryOrangeLight,
  },
  guideImage: { width: 76, height: 76, borderRadius: 38, marginBottom: spacing.sm },
  guideName: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  guideRole: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  guideChooseButton: {
    minHeight: 44,
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  guideChooseText: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    overflow: 'hidden',
    width: 24,
    height: 24,
    borderRadius: 12,
    color: colors.surface,
    backgroundColor: colors.primaryOrange,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '700',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: { backgroundColor: colors.primaryOrange },
  chipText: { color: colors.textMuted, fontSize: 12 },
  chipTextActive: { color: colors.surface },
  preferenceHint: { ...typography.caption, color: colors.warning },
  languageRow: { flexDirection: 'row', gap: spacing.sm },
  languageButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  languageButtonActive: {
    borderColor: colors.primaryOrange,
    backgroundColor: colors.primaryOrangeLight,
  },
  languageButtonText: { ...typography.body, color: colors.foreground },
  languageButtonTextActive: { color: colors.primaryOrange, fontWeight: '600' },
  routeSummaryCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  routeSummaryTitle: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  routeSummaryMeta: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  primaryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryOrange,
    alignItems: 'center',
  },
  primaryText: { ...typography.caption, color: colors.surface },
  plainButton: { alignItems: 'center', paddingVertical: spacing.sm },
  plainButtonText: { ...typography.caption, color: colors.foreground },
});
