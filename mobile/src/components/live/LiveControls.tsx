import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { LivePresentationState } from '../../presentation';

type LiveControlsProps = {
  presentation: LivePresentationState;
  muted: boolean;
  sessionActive: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
  onPausePlayback: () => void;
  onResumePlayback: () => void;
  onSkipStory: () => void;
  onToggleMute: () => void;
};

export function LiveControls({
  presentation,
  muted,
  sessionActive,
  onStartSession,
  onEndSession,
  onPausePlayback,
  onResumePlayback,
  onSkipStory,
  onToggleMute,
}: LiveControlsProps) {
  const playbackCanPause =
    presentation.playbackState === 'playing' || presentation.playbackState === 'loading';
  const playbackCanResume = presentation.playbackState === 'paused';
  const storyActionEnabled = Boolean(sessionActive && presentation.activeTarget);

  if (!sessionActive) {
    return (
      <View style={styles.row}>
        <ControlButton label="Start" variant="primary" onPress={onStartSession} />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {playbackCanResume ? (
        <ControlButton label="Resume" onPress={onResumePlayback} />
      ) : (
        <ControlButton label="Pause" onPress={onPausePlayback} disabled={!playbackCanPause} />
      )}
      <ControlButton label="Skip" onPress={onSkipStory} disabled={!storyActionEnabled} />
      <ControlButton label={muted ? 'Unmute' : 'Mute'} onPress={onToggleMute} />
      <ControlButton label="End" variant="danger" onPress={onEndSession} />
    </View>
  );
}

function ControlButton({
  label,
  onPress,
  disabled = false,
  variant = 'default',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, getVariantStyle(variant), disabled && styles.disabled]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'primary' && styles.primaryText,
          variant === 'danger' && styles.dangerText,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function getVariantStyle(variant: 'default' | 'primary' | 'danger'): StyleProp<ViewStyle> {
  if (variant === 'primary') return styles.primary;
  if (variant === 'danger') return styles.danger;
  return styles.default;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  button: {
    minHeight: 42,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  default: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primary: {
    backgroundColor: colors.foreground,
  },
  danger: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  disabled: {
    opacity: 0.45,
  },
  buttonText: {
    ...typography.label,
    color: colors.foreground,
  },
  primaryText: {
    color: colors.surface,
  },
  dangerText: {
    color: colors.danger,
  },
});
