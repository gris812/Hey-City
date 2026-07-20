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
import { colors, radius, shadows, spacing, typography } from '../../theme';

export type GuideQuickPreviewSheetProps = {
  visible: boolean;
  topInset: number;
  guideImage: ImageSourcePropType;
  guideName: string;
  role: string;
  shortCopy: string;
  suggestedInterests: string[];
  chooseLabel: string;
  fullProfileLabel: string;
  closeLabel: string;
  selected: boolean;
  selectedLabel: string;
  onChoose: () => void;
  onViewFullProfile: () => void;
  onClose: () => void;
};

export function GuideQuickPreviewSheet({
  visible,
  topInset,
  guideImage,
  guideName,
  role,
  shortCopy,
  suggestedInterests,
  chooseLabel,
  fullProfileLabel,
  closeLabel,
  selected,
  selectedLabel,
  onChoose,
  onViewFullProfile,
  onClose,
}: GuideQuickPreviewSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingTop: spacing.md, marginTop: topInset + spacing.xl }]}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
              <Image source={guideImage} style={styles.avatar} resizeMode="cover" />
              <View style={styles.headerText}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} maxFontSizeMultiplier={1.2}>
                    {guideName}
                  </Text>
                  {selected && <Text style={styles.selectedPill}>{selectedLabel}</Text>}
                </View>
                <Text style={styles.role} maxFontSizeMultiplier={1.2}>
                  {role}
                </Text>
              </View>
            </View>

            <Text style={styles.copy}>{shortCopy}</Text>

            <View style={styles.tagRow}>
              {suggestedInterests.map((interest) => (
                <Text key={interest} style={styles.tag}>
                  {interest}
                </Text>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={onChoose}
              accessibilityRole="button"
              accessibilityLabel={`${chooseLabel}. ${guideName}, ${role}${selected ? `. ${selectedLabel}` : ''}`}
            >
              <Text style={styles.primaryText}>{chooseLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={onViewFullProfile}
              accessibilityRole="button"
              accessibilityLabel={`${fullProfileLabel}: ${guideName}, ${role}`}
            >
              <Text style={styles.secondaryText}>{fullProfileLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.closeText}>{closeLabel}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,20,20,0.22)',
  },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.background,
    ...shadows.floating,
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: colors.surfaceMuted,
  },
  headerText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.title, color: colors.foreground, fontSize: 30, lineHeight: 36 },
  role: { ...typography.body, color: colors.primaryOrange, fontWeight: '700' },
  selectedPill: {
    overflow: 'hidden',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryOrangeLight,
    color: colors.primaryOrange,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  copy: { ...typography.body, color: colors.foreground, fontSize: 18, lineHeight: 25 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    overflow: 'hidden',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(121,82,45,0.16)',
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 18,
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    borderColor: colors.primaryOrange,
    backgroundColor: colors.primaryOrange,
  },
  primaryText: { ...typography.body, color: colors.surface, fontWeight: '700' },
  secondaryText: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  closeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { ...typography.caption, color: colors.textMuted },
});
