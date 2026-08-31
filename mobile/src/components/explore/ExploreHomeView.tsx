import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';
import { useAppTranslation } from '../../localization';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import type { ExploreHomeViewModel } from '../../presentation/liveForeground';

export type ExploreHomeMarker = {
  id: string;
  coordinate: LatLng;
  title: string;
  targetType?: string;
  selected?: boolean;
};

export type ExploreNearbyPlace = ExploreHomeMarker & {
  distanceMeters: number;
  isAhead?: boolean;
};

export type ExploreActiveTarget = ExploreNearbyPlace & {
  isNarrating: boolean;
};

export type ExploreHomeViewProps = {
  height: number;
  topInset: number;
  region: Region;
  markers: ExploreHomeMarker[];
  nearbyPlaces: ExploreNearbyPlace[];
  activeTarget?: ExploreActiveTarget;
  guideImage: ImageSourcePropType;
  viewModel: ExploreHomeViewModel;
  onOpenMenu: () => void;
  onOpenGuide: () => void;
  onChooseGuidedWalk: () => void;
  onSelectPlace: (place: ExploreNearbyPlace) => void;
  statusMessage?: string;
  onRetry?: () => void;
  children?: React.ReactNode;
};

export function ExploreHomeView({
  height,
  topInset,
  region,
  markers,
  nearbyPlaces,
  activeTarget,
  guideImage,
  viewModel,
  onOpenMenu,
  onOpenGuide,
  onChooseGuidedWalk,
  onSelectPlace,
  statusMessage,
  onRetry,
  children,
}: ExploreHomeViewProps) {
  const { locale, t } = useAppTranslation();
  const visibleNearbyPlaces = nearbyPlaces
    .filter((place) => place.id !== activeTarget?.id)
    .slice(0, 4);

  return (
    <View style={[styles.stage, { height }]}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            title={marker.title}
            anchor={{ x: 0.5, y: 1 }}
            onPress={() => {
              const place = [activeTarget, ...nearbyPlaces].find((item) => item?.id === marker.id);
              if (place) onSelectPlace(place);
            }}
          >
            <MapPin targetType={marker.targetType} selected={marker.selected} />
          </Marker>
        ))}
      </MapView>

      <View style={[styles.topBar, { top: topInset + spacing.sm }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('walking.openMenu')}
          style={styles.roundButton}
          onPress={onOpenMenu}
        >
          <View style={styles.menuIcon}>
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </View>
        </TouchableOpacity>

        <View style={styles.walkingPill}>
          <View style={styles.statusDot} />
          <Text style={styles.walkingPillText} numberOfLines={1}>
            {viewModel.primaryStatusLabel}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('walking.openGuide')}
          style={styles.avatarButton}
          onPress={onOpenGuide}
        >
          <Image source={guideImage} style={styles.guideAvatar} resizeMode="cover" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('walking.searchPlaceholder')}
        style={[styles.searchBar, { top: topInset + 70 }]}
        onPress={onChooseGuidedWalk}
        activeOpacity={0.92}
      >
        <View style={styles.searchIcon}>
          <View style={styles.searchRing} />
          <View style={styles.searchHandle} />
        </View>
        <Text style={styles.searchPlaceholder} numberOfLines={1}>
          {t('walking.searchPlaceholder')}
        </Text>
        <Text style={styles.searchAction} numberOfLines={1}>
          {t('walking.guidedWalk')}
        </Text>
      </TouchableOpacity>

      {statusMessage && (
        <View style={[styles.statusBanner, { top: topInset + 136 }]}>
          <View style={styles.statusWarningIcon}>
            <Text style={styles.statusWarningGlyph}>!</Text>
          </View>
          <Text style={styles.statusMessage} numberOfLines={3}>{statusMessage}</Text>
          {onRetry && (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.retryButton}
              onPress={onRetry}
            >
              <Text style={styles.retryText}>{t('walking.retry')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {children}

      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{t('walking.nearby')}</Text>
          <Text style={styles.areaName} numberOfLines={1}>
            {viewModel.areaName}
          </Text>
        </View>

        {activeTarget ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${t('walking.openPlace')}: ${activeTarget.title}`}
            activeOpacity={0.88}
            style={styles.activeCard}
            onPress={() => onSelectPlace(activeTarget)}
          >
            <View style={styles.placeThumb}>
              <MapPin targetType={activeTarget.targetType} selected compact />
            </View>
            <View style={styles.activeCopy}>
              <Text style={styles.activeTitle} numberOfLines={1}>
                {activeTarget.title}
              </Text>
              <Text style={styles.placeMeta} numberOfLines={1}>
                {formatTargetType(activeTarget.targetType, locale)} · {formatDistance(activeTarget.distanceMeters)}
              </Text>
              <Text style={styles.activeSummary} numberOfLines={2}>
                {activeTarget.isNarrating
                  ? t('walking.guideSpeaking').replace('{guide}', viewModel.guideName)
                  : t('walking.targetReady')}
              </Text>
            </View>
            <View style={[styles.audioBadge, activeTarget.isNarrating && styles.audioBadgeActive]}>
              <Text
                style={[
                  styles.audioBadgeIcon,
                  activeTarget.isNarrating && styles.audioBadgeIconActive,
                ]}
              >
                {activeTarget.isNarrating ? '▥' : '✓'}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.ambientCard}>
            <View style={styles.ambientIcon}>
              <View style={styles.ambientPulse} />
            </View>
            <View style={styles.ambientCopy}>
              <Text style={styles.ambientTitle}>{t('walking.listeningTitle')}</Text>
              <Text style={styles.ambientBody} numberOfLines={2}>
                {viewModel.ambientCopy}
              </Text>
            </View>
          </View>
        )}

        {visibleNearbyPlaces.length > 0 ? (
          <>
            <Text style={styles.nearbyTitle}>{t('walking.interestingNearby')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.nearbyRow}
            >
              {visibleNearbyPlaces.map((place) => (
                <TouchableOpacity
                  key={place.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('walking.openPlace')}: ${place.title}`}
                  activeOpacity={0.86}
                  style={styles.nearbyCard}
                  onPress={() => onSelectPlace(place)}
                >
                  <View style={styles.nearbyMarker}>
                    <MapPin targetType={place.targetType} compact />
                  </View>
                  <Text style={styles.nearbyName} numberOfLines={2}>
                    {place.title}
                  </Text>
                  <Text style={styles.nearbyDistance}>{formatDistance(place.distanceMeters)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.guidedButton}
            onPress={onChooseGuidedWalk}
          >
            <Text style={styles.guidedButtonText}>{t('walking.chooseWalk')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function MapPin({
  targetType,
  selected = false,
  compact = false,
}: {
  targetType?: string;
  selected?: boolean;
  compact?: boolean;
}) {
  const accent = selected ? colors.primary : getTargetAccent(targetType);
  return (
    <View style={[styles.pinWrap, compact && styles.pinWrapCompact]}>
      <View
        style={[
          styles.pinCircle,
          compact && styles.pinCircleCompact,
          { backgroundColor: accent },
          selected && styles.pinCircleSelected,
        ]}
      >
        <Text style={[styles.pinGlyph, compact && styles.pinGlyphCompact]}>
          {getTargetGlyph(targetType)}
        </Text>
      </View>
      {!compact && <View style={[styles.pinTail, { backgroundColor: accent }]} />}
    </View>
  );
}

export function getTargetGlyph(targetType?: string): string {
  if (targetType?.includes('park') || targetType === 'natural_feature') return '♣';
  if (targetType === 'museum' || targetType?.includes('landmark')) return '◆';
  if (targetType === 'bridge') return '≋';
  if (targetType === 'monument') return '✦';
  return '•';
}

export function getTargetAccent(targetType?: string): string {
  if (targetType?.includes('park') || targetType === 'natural_feature') return '#198754';
  if (targetType === 'museum' || targetType?.includes('landmark')) return '#8357C5';
  if (targetType === 'bridge') return '#C77A1A';
  return '#617168';
}

export function formatTargetType(targetType: string | undefined, locale: 'en' | 'ru'): string {
  const labels: Record<string, { en: string; ru: string }> = {
    city: { en: 'City', ru: 'Город' },
    town: { en: 'Town', ru: 'Город' },
    locality: { en: 'Locality', ru: 'Населённый пункт' },
    region: { en: 'Region', ru: 'Регион' },
    historical_landmark: { en: 'Historical landmark', ru: 'Историческая достопримечательность' },
    cultural_landmark: { en: 'Cultural landmark', ru: 'Культурная достопримечательность' },
    monument: { en: 'Monument', ru: 'Памятник' },
    museum: { en: 'Museum', ru: 'Музей' },
    national_park: { en: 'National park', ru: 'Национальный парк' },
    state_park: { en: 'State park', ru: 'Парк штата' },
    park: { en: 'Park', ru: 'Парк' },
    natural_feature: { en: 'Natural feature', ru: 'Природный объект' },
    bridge: { en: 'Bridge', ru: 'Мост' },
    visitor_center: { en: 'Visitor center', ru: 'Туристический центр' },
    university: { en: 'University', ru: 'Университет' },
    other_significant_place: { en: 'City place', ru: 'Городской объект' },
  };
  if (!targetType) return locale === 'ru' ? 'Городской объект' : 'City place';
  return labels[targetType]?.[locale] ?? targetType.replace(/_/g, ' ');
}

export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) return `${Math.max(10, Math.round(distanceMeters / 10) * 10)} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

const styles = StyleSheet.create({
  stage: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  topBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  roundButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(216,229,219,0.9)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...shadows.subtle,
  },
  menuIcon: { width: 20, gap: 4 },
  menuLine: { height: 2, borderRadius: 1, backgroundColor: colors.foreground },
  walkingPill: {
    minHeight: 42,
    maxWidth: 210,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(216,229,219,0.88)',
    backgroundColor: 'rgba(255,255,255,0.94)',
    ...shadows.subtle,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryBright },
  walkingPillText: { ...typography.caption, flexShrink: 1, color: colors.primary, fontWeight: '700' },
  avatarButton: {
    width: 50,
    height: 50,
    overflow: 'hidden',
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
    ...shadows.subtle,
  },
  guideAvatar: { width: '100%', height: '100%' },
  searchBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 29,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(216,229,219,0.9)',
    backgroundColor: 'rgba(255,255,255,0.97)',
    ...shadows.floating,
  },
  searchIcon: { width: 20, height: 20 },
  searchRing: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.foreground,
  },
  searchHandle: {
    position: 'absolute',
    right: 1,
    bottom: 2,
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.foreground,
    transform: [{ rotate: '45deg' }],
  },
  searchPlaceholder: { ...typography.body, flex: 1, color: colors.textMuted },
  searchAction: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  statusBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 31,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(195,62,62,0.22)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    ...shadows.subtle,
  },
  statusWarningIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#FCEBEC',
  },
  statusWarningGlyph: { color: colors.danger, fontSize: 18, lineHeight: 21, fontWeight: '800' },
  statusMessage: { ...typography.caption, flex: 1, color: colors.foreground },
  retryButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  retryText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  bottomSheet: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    zIndex: 28,
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(216,229,219,0.9)',
    backgroundColor: 'rgba(255,255,255,0.97)',
    ...shadows.floating,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sheetTitle: { ...typography.label, color: colors.foreground },
  areaName: { ...typography.caption, flex: 1, color: colors.textMuted, textAlign: 'right' },
  activeCard: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.subtle,
  },
  placeThumb: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  activeCopy: { flex: 1, minWidth: 0 },
  activeTitle: { ...typography.body, color: colors.foreground, fontWeight: '700' },
  placeMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  activeSummary: { ...typography.caption, color: colors.foreground, marginTop: 5 },
  audioBadge: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
  },
  audioBadgeActive: { backgroundColor: colors.primary },
  audioBadgeIcon: { color: colors.primary, fontSize: 17, fontWeight: '800' },
  audioBadgeIconActive: { color: colors.surface },
  ambientCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  ambientIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: colors.surface,
  },
  ambientPulse: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primaryBright },
  ambientCopy: { flex: 1 },
  ambientTitle: { ...typography.label, color: colors.primary },
  ambientBody: { ...typography.caption, color: colors.foreground, marginTop: 3 },
  nearbyTitle: { ...typography.caption, color: colors.foreground, fontWeight: '700' },
  nearbyRow: { gap: spacing.sm, paddingRight: spacing.md },
  nearbyCard: {
    width: 126,
    minHeight: 108,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  nearbyMarker: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm,
  },
  nearbyName: { ...typography.caption, minHeight: 32, color: colors.foreground, fontWeight: '600' },
  nearbyDistance: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  guidedButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  guidedButtonText: { ...typography.label, color: colors.surface },
  pinWrap: { width: 44, height: 52, alignItems: 'center' },
  pinWrapCompact: { width: 32, height: 32, justifyContent: 'center' },
  pinCircle: {
    zIndex: 2,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: 3,
    borderColor: colors.surface,
    ...shadows.subtle,
  },
  pinCircleCompact: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  pinCircleSelected: { borderColor: colors.surface },
  pinTail: {
    position: 'absolute',
    top: 28,
    width: 16,
    height: 16,
    transform: [{ rotate: '45deg' }],
  },
  pinGlyph: { zIndex: 3, color: colors.surface, fontSize: 17, lineHeight: 20, fontWeight: '800' },
  pinGlyphCompact: { fontSize: 13, lineHeight: 16 },
});
