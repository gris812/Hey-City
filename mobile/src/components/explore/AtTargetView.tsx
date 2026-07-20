import React, { useState } from 'react';
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
import type { GuidedTargetMarker } from './GuidedNavigationView';

export type AtTargetMedia = {
  imageSource?: ImageSourcePropType;
  imageAlt?: string;
  attribution?: string;
};

export type AtTargetViewProps = {
  height: number;
  region: Region;
  completedRouteCoordinates: LatLng[];
  upcomingRouteCoordinates: LatLng[];
  targets: GuidedTargetMarker[];
  userCoordinate?: LatLng;
  targetTitle: string;
  categoryLabel: string;
  guideName: string;
  guideImage: ImageSourcePropType;
  stopProgressLabel: string;
  media: AtTargetMedia;
  fallbackTitle: string;
  fallbackBody: string;
  startStoryLabel: string;
  onStartStory: () => void;
};

export function AtTargetView({
  height,
  region,
  completedRouteCoordinates,
  upcomingRouteCoordinates,
  targets,
  userCoordinate,
  targetTitle,
  categoryLabel,
  guideName,
  guideImage,
  stopProgressLabel,
  media,
  fallbackTitle,
  fallbackBody,
  startStoryLabel,
  onStartStory,
}: AtTargetViewProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageSource = imageFailed ? undefined : media.imageSource;

  return (
    <View style={[styles.mapWrap, { height }]}>
      <MapView style={StyleSheet.absoluteFillObject} initialRegion={region} region={region}>
        {completedRouteCoordinates.length > 1 && (
          <Polyline coordinates={completedRouteCoordinates} strokeColor={colors.routeCompleted} strokeWidth={4} />
        )}
        {upcomingRouteCoordinates.length > 1 && (
          <Polyline coordinates={upcomingRouteCoordinates} strokeColor={colors.primaryOrange} strokeWidth={5} />
        )}
        {targets.map((target) => (
          <Marker key={target.id} coordinate={target.coordinate} title={target.title} pinColor={target.pinColor} />
        ))}
        {userCoordinate && <Marker coordinate={userCoordinate} title="You" pinColor={colors.dana} />}
      </MapView>

      <View style={styles.card}>
        {imageSource ? (
          <View style={styles.imageWrap} accessibilityLabel={media.imageAlt}>
            <Image
              source={imageSource}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
            {media.attribution && <Text style={styles.attribution}>{media.attribution}</Text>}
          </View>
        ) : (
          <View style={styles.fallbackCard}>
            <View style={styles.fallbackMarker}>
              <Text style={styles.fallbackMarkerText}>⌖</Text>
            </View>
            <View style={styles.fallbackTextWrap}>
              <Text style={styles.fallbackTitle}>{fallbackTitle}</Text>
              <Text style={styles.fallbackBody}>{fallbackBody}</Text>
            </View>
          </View>
        )}

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
          {targetTitle}
        </Text>
        <Text style={styles.category} numberOfLines={1} maxFontSizeMultiplier={1.1}>
          {categoryLabel}
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={onStartStory} accessibilityRole="button">
          <Text style={styles.primaryText}>{startStoryLabel}</Text>
        </TouchableOpacity>
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
    backgroundColor: 'rgba(255,253,248,0.93)',
    ...shadows.floating,
  },
  imageWrap: {
    overflow: 'hidden',
    minHeight: 150,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  image: { width: '100%', height: 166 },
  attribution: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    overflow: 'hidden',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.48)',
    color: colors.surface,
    fontSize: 10,
    lineHeight: 13,
  },
  fallbackCard: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(244,240,232,0.76)',
  },
  fallbackMarker: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryOrange,
  },
  fallbackMarkerText: { color: colors.surface, fontSize: 28, lineHeight: 32, fontWeight: '800' },
  fallbackTextWrap: { flex: 1, minWidth: 0 },
  fallbackTitle: { ...typography.body, color: colors.foreground, fontWeight: '700' },
  fallbackBody: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted },
  guideText: { flex: 1, minWidth: 0 },
  guideName: { ...typography.caption, color: colors.foreground, fontWeight: '700' },
  progress: { ...typography.caption, color: colors.textMuted },
  title: { ...typography.title, color: colors.foreground, fontSize: 28, lineHeight: 34 },
  category: { ...typography.caption, color: colors.primaryOrange, fontWeight: '700' },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primaryOrange,
  },
  primaryText: { ...typography.body, color: colors.surface, fontWeight: '700' },
});
