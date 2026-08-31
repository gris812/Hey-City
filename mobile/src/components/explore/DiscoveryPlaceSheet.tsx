import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useAppTranslation } from '../../localization';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import {
  formatDistance,
  formatTargetType,
  getTargetAccent,
  getTargetGlyph,
  type ExploreNearbyPlace,
} from './ExploreHomeView';

export type DiscoveryPlaceSheetProps = {
  visible: boolean;
  bottomInset: number;
  place?: ExploreNearbyPlace;
  guideName: string;
  guideImage: ImageSourcePropType;
  hasActiveStory: boolean;
  onClose: () => void;
  onOpenMaps: (place: ExploreNearbyPlace) => void;
  onOpenStory: () => void;
};

export function DiscoveryPlaceSheet({
  visible,
  bottomInset,
  place,
  guideName,
  guideImage,
  hasActiveStory,
  onClose,
  onOpenMaps,
  onOpenStory,
}: DiscoveryPlaceSheetProps) {
  const { locale, t } = useAppTranslation();
  if (!place) return null;

  const accent = getTargetAccent(place.targetType);
  const contextCopy = place.isAhead ? t('walking.placeAhead') : t('walking.placeNearby');

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={styles.backdrop}
          onPress={onClose}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(spacing.md, bottomInset) }]}>
          <View style={styles.handle} />

          <View style={styles.hero}>
            <MapView
              key={place.id}
              pointerEvents="none"
              style={StyleSheet.absoluteFillObject}
              initialRegion={{
                latitude: place.coordinate.latitude,
                longitude: place.coordinate.longitude,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
              }}
              scrollEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              zoomEnabled={false}
              toolbarEnabled={false}
            >
              <Marker coordinate={place.coordinate} title={place.title} pinColor={colors.primary} />
            </MapView>
            <View style={styles.heroShade} />
            <View style={[styles.categoryIcon, { backgroundColor: accent }]}>
              <Text style={styles.categoryGlyph}>{getTargetGlyph(place.targetType)}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeGlyph}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.metaRow}>
              <Text style={styles.categoryLabel}>{formatTargetType(place.targetType, locale)}</Text>
              <View style={styles.distancePill}>
                <Text style={styles.distanceText}>{formatDistance(place.distanceMeters)}</Text>
              </View>
            </View>

            <Text style={styles.title}>{place.title}</Text>
            <Text style={styles.contextCopy}>{contextCopy}</Text>

            <View style={styles.guideNote}>
              <Image source={guideImage} style={styles.guideAvatar} />
              <View style={styles.guideCopy}>
                <Text style={styles.guideName}>{guideName}</Text>
                <Text style={styles.guideStatus}>
                  {hasActiveStory ? t('walking.storyReady') : t('walking.storyAutomatic')}
                </Text>
              </View>
            </View>

            {hasActiveStory && (
              <TouchableOpacity style={styles.primaryButton} onPress={onOpenStory}>
                <Text style={styles.primaryButtonText}>{t('walking.openStory')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.secondaryButton} onPress={() => onOpenMaps(place)}>
              <Text style={styles.secondaryButtonText}>{t('walking.openInMaps')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,23,17,0.34)' },
  sheet: {
    overflow: 'hidden',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.surface,
    ...shadows.floating,
  },
  handle: {
    position: 'absolute',
    top: 9,
    left: '50%',
    zIndex: 10,
    width: 42,
    height: 4,
    marginLeft: -21,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  hero: { height: 220, justifyContent: 'flex-end', padding: spacing.md },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,122,63,0.08)',
  },
  categoryIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    borderWidth: 3,
    borderColor: colors.surface,
    ...shadows.subtle,
  },
  categoryGlyph: { color: colors.surface, fontSize: 22, lineHeight: 26, fontWeight: '800' },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...shadows.subtle,
  },
  closeGlyph: { color: colors.foreground, fontSize: 28, lineHeight: 30, fontWeight: '400' },
  content: { gap: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  categoryLabel: { ...typography.label, flex: 1, color: colors.primary },
  distancePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  distanceText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  title: { ...typography.title, color: colors.foreground, fontSize: 30, lineHeight: 36 },
  contextCopy: { ...typography.body, color: colors.textMuted },
  guideNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  guideAvatar: { width: 48, height: 48, borderRadius: 24 },
  guideCopy: { flex: 1 },
  guideName: { ...typography.label, color: colors.primary },
  guideStatus: { ...typography.caption, color: colors.foreground, marginTop: 2 },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { ...typography.label, color: colors.surface },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { ...typography.label, color: colors.foreground },
});
