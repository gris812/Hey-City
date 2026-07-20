import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';

export type TranscriptSheetProps = {
  visible: boolean;
  topInset: number;
  title: string;
  body: string;
  onClose: () => void;
};

export function TranscriptSheet({ visible, topInset, title, body, onClose }: TranscriptSheetProps) {
  return (
    <Modal visible={visible} animationType="slide">
      <View style={[styles.screen, { paddingTop: topInset + spacing.lg }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>Transcript</Text>
            <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1}>
              {title}
            </Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel="Close transcript">
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.body}>{body}</Text>
        </ScrollView>
        <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
          <Text style={styles.primaryText}>Done</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  kicker: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  title: { ...typography.title, color: colors.foreground },
  closeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  closeText: { color: colors.foreground, fontSize: 26, lineHeight: 30 },
  scroll: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  scrollContent: { padding: spacing.lg },
  body: { ...typography.body, color: colors.foreground },
  primaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryOrange,
  },
  primaryText: { ...typography.body, color: colors.surface, fontWeight: '700' },
});
