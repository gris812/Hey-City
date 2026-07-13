import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { LivePresentationState } from '../../presentation';

type LiveStatusPillProps = {
  presentation: LivePresentationState;
};

export function LiveStatusPill({ presentation }: LiveStatusPillProps) {
  const status = getStatus(presentation);

  return (
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: status.color }]} />
      <Text style={styles.text}>{status.label}</Text>
    </View>
  );
}

function getStatus(presentation: LivePresentationState): { label: string; color: string } {
  if (presentation.playbackState === 'error') {
    return { label: 'Playback issue', color: colors.danger };
  }

  if (presentation.playbackState === 'paused') {
    return { label: 'Paused', color: colors.warning };
  }

  if (presentation.playbackState === 'playing') {
    return { label: presentation.activeTarget?.name ?? 'Story active', color: colors.arthur };
  }

  if (presentation.discoveryPhase === 'holding') {
    return { label: presentation.holdReason ?? 'Holding', color: colors.warning };
  }

  if (presentation.discoveryPhase === 'approaching') {
    return { label: 'Approaching', color: colors.dana };
  }

  if (presentation.discoveryPhase === 'idle') {
    return { label: 'Session idle', color: colors.textMuted };
  }

  return { label: 'Exploring', color: colors.dana };
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.subtle,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  text: {
    ...typography.label,
    color: colors.foreground,
  },
});
