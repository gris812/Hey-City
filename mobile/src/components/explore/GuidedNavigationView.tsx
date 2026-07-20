import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, type LatLng, type Region } from 'react-native-maps';
import { colors, radius, shadows, spacing, typography } from '../../theme';

export type GuidedTargetMarker = {
  id: string;
  coordinate: LatLng;
  title: string;
  pinColor: string;
};

export type GuidedNavigationViewProps = {
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
  journeyStateLabel: string;
  distanceMeters?: number;
  approachText?: string | null;
  isPaused: boolean;
  onTogglePause: () => void;
  onTranscript: () => void;
  onEndTour: () => void;
};

export function GuidedNavigationView({
  height,
  region,
  completedRouteCoordinates,
  upcomingRouteCoordinates,
  targets,
  userCoordinate,
  currentTargetTitle,
  currentTargetSequence,
  totalTargets,
  guideImage,
  guideName,
  journeyStateLabel,
  distanceMeters,
  approachText,
  isPaused,
  onTogglePause,
  onTranscript,
  onEndTour,
}: GuidedNavigationViewProps) {
  return (
    <View style={[styles.mapWrap, { height }]}>
      <MapView style={StyleSheet.absoluteFillObject} initialRegion={region} region={region}>
        {completedRouteCoordinates.length > 1 && (
          <Polyline coordinates={completedRouteCoordinates} strokeColor={colors.routeCompleted} strokeWidth={5} />
        )}
        {upcomingRouteCoordinates.length > 1 && (
          <Polyline coordinates={upcomingRouteCoordinates} strokeColor={colors.primaryOrange} strokeWidth={5} />
        )}
        {targets.map((target) => (
          <Marker
            key={target.id}
            coordinate={target.coordinate}
            title={target.title}
            pinColor={target.pinColor}
          />
        ))}
        {userCoordinate && <Marker coordinate={userCoordinate} title="You" pinColor={colors.dana} />}
      </MapView>

      <View style={styles.topOverlay}>
        <Text style={styles.topChip} numberOfLines={1} maxFontSizeMultiplier={1}>
          Next: {currentTargetTitle} - 8 min walk
        </Text>
        <Text style={styles.stopChip} numberOfLines={1} maxFontSizeMultiplier={1}>
          Stop {currentTargetSequence} of {totalTargets}
        </Text>
      </View>

      <View style={styles.infoOverlay}>
        <View style={styles.headerRow}>
          <Image source={guideImage} style={styles.guideAvatar} resizeMode="cover" />
          <View style={styles.infoText}>
            <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1}>
              {guideName}
            </Text>
            <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1}>
              Walking to {currentTargetTitle}
            </Text>
            <Text style={styles.mutedText} numberOfLines={2} maxFontSizeMultiplier={1}>
              Next story starts when you arrive.
            </Text>
          </View>
        </View>

        <View style={styles.metrics}>
          <Text style={styles.mutedText} numberOfLines={1} maxFontSizeMultiplier={1}>
            State: {journeyStateLabel}
          </Text>
          {typeof distanceMeters === 'number' && (
            <Text style={styles.mutedText} numberOfLines={1} maxFontSizeMultiplier={1}>
              Distance: {Math.round(distanceMeters)} m
            </Text>
          )}
        </View>

        {approachText && (
          <View style={styles.approachBox}>
            <Text style={styles.label}>Approach</Text>
            <Text style={styles.mutedText}>{approachText}</Text>
          </View>
        )}

        <View style={styles.controlsRow}>
          <TouchableOpacity style={[styles.controlButton, styles.primaryButton]} onPress={onTogglePause}>
            <Text style={[styles.controlText, styles.primaryText]}>
              {isPaused ? 'Resume' : 'Pause'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={onTranscript}>
            <Text style={styles.controlText}>Transcript</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={onEndTour}>
            <Text style={styles.controlText}>End Tour</Text>
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
  topOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 24,
    alignItems: 'center',
    gap: spacing.sm,
  },
  topChip: {
    overflow: 'hidden',
    maxWidth: '100%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.94)',
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  stopChip: {
    overflow: 'hidden',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.88)',
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
  },
  infoOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.48)',
    backgroundColor: 'rgba(255,253,248,0.86)',
    zIndex: 30,
    ...shadows.floating,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  guideAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
  },
  infoText: { flex: 1 },
  label: { ...typography.caption, color: colors.textMuted },
  title: {
    ...typography.body,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: 2,
  },
  mutedText: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  metrics: { gap: 2 },
  approachBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(244,240,232,0.62)',
  },
  controlsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  controlButton: {
    flex: 1,
    minWidth: 86,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,240,232,0.92)',
  },
  primaryButton: { backgroundColor: colors.primaryOrange },
  controlText: { ...typography.caption, color: colors.foreground },
  primaryText: { color: colors.surface },
});
