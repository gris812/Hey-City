import React from 'react';
import { Image, type ImageSourcePropType, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, type LatLng, type Region } from 'react-native-maps';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import type { GuidedTargetMarker } from './GuidedNavigationView';

export type ApproachingTargetViewProps = {
  height: number;
  region: Region;
  completedRouteCoordinates: LatLng[];
  upcomingRouteCoordinates: LatLng[];
  targets: GuidedTargetMarker[];
  userCoordinate?: LatLng;
  currentTargetTitle: string;
  currentTargetSequence: number;
  totalTargets: number;
  guideImage: ImageSourcePropType;
  guideName: string;
  titleLabel: string;
  message: string;
  distanceLabel?: string;
  stopProgressLabel: string;
  pauseLabel: string;
  resumeLabel: string;
  endTourLabel: string;
  isPaused: boolean;
  onTogglePause: () => void;
  onEndTour: () => void;
};

export function ApproachingTargetView({
  height,
  region,
  completedRouteCoordinates,
  upcomingRouteCoordinates,
  targets,
  userCoordinate,
  currentTargetTitle,
  guideImage,
  guideName,
  titleLabel,
  message,
  distanceLabel,
  stopProgressLabel,
  currentTargetSequence,
  pauseLabel,
  resumeLabel,
  endTourLabel,
  isPaused,
  onTogglePause,
  onEndTour,
}: ApproachingTargetViewProps) {
  return (
    <View style={[styles.mapWrap, { height }]}>
      <MapView style={StyleSheet.absoluteFillObject} initialRegion={region} region={region}>
        {completedRouteCoordinates.length > 1 && (
          <Polyline coordinates={completedRouteCoordinates} strokeColor={colors.routeCompleted} strokeWidth={4} />
        )}
        {upcomingRouteCoordinates.length > 1 && (
          <Polyline coordinates={upcomingRouteCoordinates} strokeColor={colors.primaryOrange} strokeWidth={6} />
        )}
        {targets.map((target) => (
          <Marker
            key={target.id}
            coordinate={target.coordinate}
            title={target.title}
            pinColor={target.title === currentTargetTitle ? colors.primaryOrange : target.pinColor}
          />
        ))}
        {userCoordinate && <Marker coordinate={userCoordinate} title="You" pinColor={colors.dana} />}
      </MapView>

      <View style={styles.targetHalo}>
        <Text style={styles.targetHaloText}>{currentTargetSequence}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.guideRow}>
          <Image source={guideImage} style={styles.avatar} resizeMode="cover" />
          <View style={styles.guideText}>
            <Text style={styles.guideName} numberOfLines={1} maxFontSizeMultiplier={1.1}>
              {guideName}
            </Text>
            <Text style={styles.progress} numberOfLines={1} maxFontSizeMultiplier={1.1}>
              {stopProgressLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1.1}>
          {titleLabel} {currentTargetTitle}
        </Text>
        <Text style={styles.message} maxFontSizeMultiplier={1.1}>
          {message}
        </Text>
        {distanceLabel && (
          <Text style={styles.distance} numberOfLines={1} maxFontSizeMultiplier={1.1}>
            {distanceLabel}
          </Text>
        )}
        <View style={styles.controlsRow}>
          <TouchableOpacity style={[styles.controlButton, styles.primaryButton]} onPress={onTogglePause}>
            <Text style={styles.primaryText}>{isPaused ? resumeLabel : pauseLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={onEndTour}>
            <Text style={styles.controlText}>{endTourLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  targetHalo: {
    position: 'absolute',
    top: '41%',
    left: '50%',
    width: 52,
    height: 52,
    marginLeft: -26,
    marginTop: -26,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
    backgroundColor: colors.primaryOrange,
    zIndex: 22,
    ...shadows.floating,
  },
  targetHaloText: { color: colors.surface, fontSize: 18, lineHeight: 22, fontWeight: '800' },
  card: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.54)',
    backgroundColor: 'rgba(255,253,248,0.9)',
    ...shadows.floating,
  },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceMuted },
  guideText: { flex: 1, minWidth: 0 },
  guideName: { ...typography.caption, color: colors.foreground, fontWeight: '700' },
  progress: { ...typography.caption, color: colors.textMuted },
  title: { ...typography.title, color: colors.foreground, fontSize: 26, lineHeight: 31 },
  message: { ...typography.body, color: colors.foreground, fontSize: 17, lineHeight: 23 },
  distance: { ...typography.caption, color: colors.primaryOrange, fontWeight: '700' },
  controlsRow: { flexDirection: 'row', gap: spacing.sm },
  controlButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(244,240,232,0.92)',
  },
  primaryButton: { backgroundColor: colors.foreground },
  controlText: { ...typography.caption, color: colors.foreground },
  primaryText: { ...typography.caption, color: colors.surface, fontWeight: '700' },
});
