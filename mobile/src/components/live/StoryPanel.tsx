import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { guideLabels, LivePresentationState } from '../../presentation';

type StoryPanelProps = {
  presentation: LivePresentationState;
  actions?: ReactNode;
};

const playbackLabels: Record<LivePresentationState['playbackState'], string> = {
  idle: 'Ready',
  loading: 'Loading story',
  playing: 'Playing',
  paused: 'Paused',
  completed: 'Completed',
  error: 'Playback issue',
};

export function StoryPanel({ presentation, actions }: StoryPanelProps) {
  const guideLabel = guideLabels[presentation.activeGuideId];
  const targetName = presentation.activeTarget?.name ?? 'City Explorer';
  const transcript =
    presentation.transcriptPreview ??
    getEmptyCopy(presentation.playbackState, presentation.discoveryPhase);

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>{guideLabel}</Text>
          <Text style={styles.targetName} numberOfLines={1}>
            {targetName}
          </Text>
        </View>
        <View style={styles.stateBadge}>
          <Text style={styles.stateText}>{playbackLabels[presentation.playbackState]}</Text>
        </View>
      </View>

      <Text style={styles.transcript}>{transcript}</Text>

      {typeof presentation.audioProgress === 'number' && (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(Math.max(presentation.audioProgress, 0), 1) * 100}%` },
            ]}
          />
        </View>
      )}

      {actions && (
        <>
          <View style={styles.separator} />
          <View style={styles.actionRow}>{actions}</View>
        </>
      )}
    </View>
  );
}

function getEmptyCopy(
  playbackState: LivePresentationState['playbackState'],
  discoveryPhase: LivePresentationState['discoveryPhase']
): string {
  if (playbackState === 'loading') return 'Preparing the next story from the current session state.';
  if (playbackState === 'paused') return 'Playback is paused locally.';
  if (playbackState === 'completed') return 'Story completed.';
  if (playbackState === 'error') return 'Playback could not continue. Try ending or skipping the story.';
  if (discoveryPhase === 'holding') return 'Holding until the backend session returns the next action.';
  return 'Exploring nearby context.';
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.floating,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.textMuted,
  },
  targetName: {
    ...typography.label,
    maxWidth: 190,
    color: colors.foreground,
  },
  stateBadge: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stateText: {
    ...typography.caption,
    color: colors.foreground,
  },
  transcript: {
    ...typography.body,
    color: colors.foreground,
    marginTop: spacing.md,
  },
  progressTrack: {
    height: 4,
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    marginTop: spacing.md,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.arthur,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
