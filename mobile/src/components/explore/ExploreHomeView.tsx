import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import type { ExplorationMode } from '../../demo/guidedTour';
import type { ExploreHomeViewModel } from '../../presentation/liveForeground';

export type ExploreHomeMarker = {
  id: string;
  coordinate: LatLng;
  title: string;
  pinColor: string;
  onPress?: () => void;
};

export type ExploreHomeViewProps = {
  height: number;
  region: Region;
  userCoordinate: LatLng;
  markers: ExploreHomeMarker[];
  modes: ExplorationMode[];
  activeMode: ExplorationMode;
  onSelectMode: (mode: ExplorationMode) => void;
  guideImage: ImageSourcePropType;
  viewModel: ExploreHomeViewModel;
  onChooseGuidedWalk: () => void;
  children?: React.ReactNode;
};

export function ExploreHomeView({
  height,
  region,
  userCoordinate,
  markers,
  modes,
  activeMode,
  onSelectMode,
  guideImage,
  viewModel,
  onChooseGuidedWalk,
  children,
}: ExploreHomeViewProps) {
  return (
    <View style={[styles.stage, { height }]}>
      <MapView style={StyleSheet.absoluteFillObject} initialRegion={region} region={region}>
        <Marker coordinate={userCoordinate} title="You" pinColor={colors.dana} />
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            title={marker.title}
            pinColor={marker.pinColor}
            onPress={marker.onPress}
          />
        ))}
      </MapView>

      <View style={styles.topOverlay}>
        <Text style={styles.areaChip} numberOfLines={1} maxFontSizeMultiplier={1}>
          {viewModel.areaName}
        </Text>
        <View style={styles.modeRow}>
          {modes.map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.modeChip, activeMode === mode && styles.modeChipActive]}
              onPress={() => onSelectMode(mode)}
            >
              <Text
                style={[styles.modeChipText, activeMode === mode && styles.modeChipTextActive]}
                numberOfLines={1}
                maxFontSizeMultiplier={1}
              >
                {mode === 'city_explorer' ? 'Explore' : 'Guided'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {children}

      <View style={styles.guideCapsule}>
        <View style={styles.capsuleHeaderRow}>
          <Image source={guideImage} style={styles.guideAvatar} resizeMode="cover" />
          <View style={styles.guideText}>
            <Text style={styles.guideName} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {viewModel.guideName}
            </Text>
            <Text style={styles.guideRole} numberOfLines={1} maxFontSizeMultiplier={1}>
              Ambient guide
            </Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusText} numberOfLines={1} maxFontSizeMultiplier={1}>
              {viewModel.primaryStatusLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.body} numberOfLines={3} maxFontSizeMultiplier={1.1}>
          {viewModel.ambientCopy}
        </Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={onChooseGuidedWalk}>
          <Text style={styles.secondaryText} numberOfLines={1} maxFontSizeMultiplier={1}>
            {viewModel.secondaryActionLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    overflow: 'hidden',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm,
  },
  topOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 20,
    gap: spacing.sm,
  },
  areaChip: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  modeRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(243,240,234,0.9)',
  },
  modeChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  modeChipActive: {
    borderWidth: 1,
    borderColor: colors.primaryOrange,
    backgroundColor: colors.surface,
  },
  modeChipText: { color: colors.textMuted, fontSize: 16, lineHeight: 20, fontWeight: '700' },
  modeChipTextActive: { color: colors.primaryOrange },
  guideCapsule: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    zIndex: 25,
    minHeight: 184,
    alignItems: 'stretch',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: 'rgba(255,255,255,0.95)',
    ...shadows.floating,
  },
  capsuleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  guideAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  guideText: { flex: 1 },
  guideName: { ...typography.body, color: colors.foreground, fontWeight: '700' },
  guideRole: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  statusPill: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryOrangeLight,
  },
  statusText: { ...typography.caption, color: colors.primaryOrange, textAlign: 'center' },
  body: { ...typography.body, color: colors.foreground },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryText: { ...typography.caption, color: colors.foreground, fontWeight: '700' },
});
