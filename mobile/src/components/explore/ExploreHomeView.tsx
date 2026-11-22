import type { StoryAvailabilityState } from '@heycity/shared';
import { useMeasurements } from '../../localization/useMeasurements';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  PanResponder,
  Platform,
  Image,
  type ImageSourcePropType,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { gpsSpeedKmh } from '../../features/live/motion';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';
import { useAppTranslation } from '../../localization';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import type { ExploreHomeViewModel } from '../../presentation/liveForeground';
import { MapCameraController, markersInViewport, vehicleCameraTickMs, type VehicleCameraFix } from '../../presentation/mapCamera';
import { exploreTopLayout } from '../../presentation/safeAreaLayout';

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
  vehicleMode?: boolean;
  vehicleCameraActive?: boolean;
  motion?: VehicleCameraFix | null;
  onTellNow?: (place: ExploreNearbyPlace) => void;
  storyAvailabilityFor?: (poiId: string) => StoryAvailabilityState;
  onEndExploration?: () => void;
  height: number;
  topInset: number;
  region: Region;
  markers: ExploreNearbyPlace[];
  nearbyPlaces: ExploreNearbyPlace[];
  activeTarget?: ExploreActiveTarget;
  greeting?: string;
  mapTarget?: ExploreNearbyPlace;
  currentLocation?: LatLng;
  onStopTracking?: (place: ExploreNearbyPlace) => void;
  onRetryNotice?: () => void;
  guideImage: ImageSourcePropType;
  viewModel: ExploreHomeViewModel;
  onOpenMenu: () => void;
  onOpenGuide: () => void;
  onChooseGuidedWalk: () => void;
  onSelectPlace: (place: ExploreNearbyPlace) => void;
  voiceState?: string;
  voiceLabel?: string;
  onToggleVoice?: () => void;
  statusMessage?: string;
  storyNotice?: string;
  onDismissStoryNotice?: () => void;
  onRetry?: () => void;
  children?: React.ReactNode;
};

export function ExploreHomeView({
  height,
  vehicleMode = false,
  vehicleCameraActive = false,
  motion = null,
  onTellNow,
  storyAvailabilityFor,
  onEndExploration,
  topInset,
  region,
  markers,
  nearbyPlaces,
  activeTarget, greeting, mapTarget, currentLocation, onStopTracking, onRetryNotice,
  guideImage,
  viewModel,
  onOpenMenu,
  onOpenGuide,
  onChooseGuidedWalk,
  onSelectPlace,
  voiceState,
  voiceLabel,
  onToggleVoice,
  statusMessage,
  storyNotice,
  onDismissStoryNotice,
  onRetry,
  children,
}: ExploreHomeViewProps) {
  const { locale, t } = useAppTranslation();
  const measurements = useMeasurements();
  const [expanded, setExpanded] = useState(true);
  const sheetPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 24) setExpanded(false);
      else if (gesture.dy < -24) setExpanded(true);
    },
  })).current;
  useEffect(() => {
    if (Platform.OS === 'ios' && storyNotice && !statusMessage) AccessibilityInfo.announceForAccessibility(storyNotice);
  }, [storyNotice, statusMessage]);
  const visibleNearbyPlaces = (vehicleMode ? [] : nearbyPlaces)
    .filter((place) => place.id !== activeTarget?.id)
    .slice(0, 4);
  const { controlTop, searchTop, statusTop } = exploreTopLayout(topInset, spacing.md);
  const mapRef = useRef<MapView | null>(null);

  const camera = useRef(new MapCameraController());
  const [cameraVersion, setCameraVersion] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [viewport, setViewport] = useState(region);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const gpsFix = useRef<VehicleCameraFix | undefined>(undefined);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  const smoothVehicleCamera = vehicleMode && vehicleCameraActive && appActive;
  useEffect(() => {
    if (!smoothVehicleCamera) return;
    let disposed = false;
    let subscription: Location.LocationSubscription | undefined;
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 8 }, fix => {
      if (disposed) return;
      gpsFix.current = { latitude: fix.coords.latitude, longitude: fix.coords.longitude, timestampMs: fix.timestamp,
        heading: fix.coords.heading, speedKmh: gpsSpeedKmh(fix.coords.speed), accuracyMeters: fix.coords.accuracy ?? undefined };
    }).then(value => { if (disposed) value.remove(); else subscription = value; })
      .catch(() => console.warn('vehicle_camera_location_unavailable'));
    return () => { disposed = true; subscription?.remove(); gpsFix.current = undefined; };
  }, [smoothVehicleCamera]);
  const [mapReady, setMapReady] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const framedTarget = useRef<ExploreNearbyPlace | undefined>(undefined);
  useEffect(() => {
    if (!mapReady || !sheetHeight || !mapTarget || !currentLocation || vehicleMode || framedTarget.current === mapTarget) return;
    framedTarget.current = mapTarget;
    camera.current.pan();
    setCameraVersion(value => value + 1);
    mapRef.current?.fitToCoordinates([currentLocation, mapTarget.coordinate], {
      edgePadding: { top: statusTop + 60, right: 65, bottom: Math.min(sheetHeight + 36, height * 0.55), left: 65 },
      animated: true,
    });
  }, [mapReady, sheetHeight, mapTarget, currentLocation, statusTop, height, vehicleMode]);
  const storyAvailability = activeTarget ? storyAvailabilityFor?.(activeTarget.id) : undefined;
  const selectionBusy = storyAvailability === 'checking';
  const highlightedPlace = mapTarget ?? activeTarget;
  const viewportMarkers = markersInViewport(markers, viewport);
  const visibleMarkers = highlightedPlace
    ? [...viewportMarkers.filter(marker => marker.id !== highlightedPlace.id), { ...highlightedPlace, selected: true }]
    : viewportMarkers;
  useEffect(() => {
    if (!appActive) return;
    const timer = setInterval(() => setNow(Date.now()), smoothVehicleCamera ? vehicleCameraTickMs : 1000);
    return () => clearInterval(timer);
  }, [appActive, smoothVehicleCamera]);
  useEffect(() => {
    if (!mapReady || !appActive) return;
    const position = { latitude: region.latitude, longitude: region.longitude };
    const time = Date.now();
    const command = smoothVehicleCamera
      ? camera.current.updateVehicle(gpsFix.current ?? motion ?? undefined, time)
      : camera.current.update(position, motion, time);
    if (command) mapRef.current?.animateCamera(command, { duration: smoothVehicleCamera ? 400 : 450 });
  }, [mapReady, appActive, region.latitude, region.longitude, motion, now, cameraVersion, smoothVehicleCamera]);
  const changeCamera = (action: () => void) => { action(); setCameraVersion(value => value + 1); };

  return (
    <View style={[styles.stage, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        onMapReady={() => setMapReady(true)}
        onRegionChangeComplete={setViewport}
        onPanDrag={() => { if (camera.current.following) changeCamera(() => camera.current.pan()); }}
        rotateEnabled={false}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {visibleMarkers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            title={marker.title}
            anchor={{ x: 0.5, y: 1 }}
            onPress={() => onSelectPlace(marker)}
          >
            <MapPin targetType={marker.targetType} selected={marker.selected} />
          </Marker>
        ))}
      </MapView>

      <View style={[styles.topBar, { top: controlTop }]}>
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
          onPress={vehicleMode ? undefined : onOpenGuide}
          disabled={vehicleMode}
        >
          <Image source={guideImage} style={styles.guideAvatar} resizeMode="contain" />
        </TouchableOpacity>
      </View>

      <View style={[styles.cameraControls, { top: searchTop + (vehicleMode ? 0 : 68) }]}>
        <TouchableOpacity accessibilityRole="button" style={styles.roundButton}
          accessibilityLabel={t(camera.current.orientation === 'north-up' ? 'map.northUp' : camera.current.reliableCourse ? 'map.courseUp' : 'map.waitingCourse')}
          accessibilityHint={t(camera.current.orientation === 'north-up' ? 'map.courseUp' : 'map.northUp')}
          onPress={() => changeCamera(() => camera.current.toggleOrientation())}>
          <Text style={{ color: colors.primary, fontWeight: '800', transform: [{ rotate: `${-camera.current.heading}deg` }] }}>N ↑</Text>
        </TouchableOpacity>
        {!camera.current.following && <TouchableOpacity accessibilityRole="button" style={styles.roundButton}
          accessibilityLabel={t('map.follow')} onPress={() => changeCamera(() => camera.current.follow())}>
          <Text style={styles.audioBadgeIcon}>◎</Text>
        </TouchableOpacity>}
        {onEndExploration && <TouchableOpacity accessibilityRole="button" style={styles.roundButton}
          accessibilityLabel={t('walking.endSession')} onPress={onEndExploration}>
          <Text style={styles.audioBadgeIcon}>■</Text>
        </TouchableOpacity>}
      </View>

      {!vehicleMode && (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('walking.searchPlaceholder')}
        style={[styles.searchBar, { top: searchTop }]}
        onPress={vehicleMode ? undefined : onChooseGuidedWalk}
        disabled={vehicleMode}
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
      )}

      {statusMessage && (
        <View style={[styles.statusBanner, { top: statusTop }]}>
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

      {storyNotice && !statusMessage && (
        <View style={[styles.statusBanner, { top: statusTop }]}>
          <Text style={styles.statusMessage} accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}>{storyNotice}</Text>
          {onRetryNotice && <TouchableOpacity accessibilityRole="button" onPress={onRetryNotice}>
            <Text style={styles.retryText}>{t('walking.retry')}</Text>
          </TouchableOpacity>}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={locale === 'ru' ? 'Закрыть уведомление' : 'Dismiss notification'}
            hitSlop={10} onPress={onDismissStoryNotice}>
            <Text style={styles.retryText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      {children}

      {onToggleVoice && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={voiceLabel ?? 'Talk to guide'}
          style={[styles.voiceButton, voiceState && voiceState !== 'closed' && styles.voiceButtonActive]}
          onPress={onToggleVoice}
        >
          <Text style={styles.voiceGlyph}>{voiceState === 'connecting' ? '…' : '●'}</Text>
          <Text style={styles.voiceLabel} numberOfLines={1}>{voiceLabel ?? 'Talk'}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.bottomSheet} onLayout={event => setSheetHeight(event.nativeEvent.layout.height)}>
        <TouchableOpacity {...sheetPan.panHandlers} accessibilityRole="button" accessibilityState={{ expanded }}
          accessibilityLabel={t('walking.nearby')} onPress={() => setExpanded(value => !value)}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{t('walking.nearby')}</Text>
          <Text style={styles.areaName} numberOfLines={1}>
            {greeting ?? viewModel.areaName}
          </Text>
          </View>
        </TouchableOpacity>

        {expanded && <>
        {activeTarget && onStopTracking && <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => onStopTracking(activeTarget)}>
          <Text style={styles.retryText}>{t('walking.stopTracking')}</Text>
        </TouchableOpacity>}
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
                {formatTargetType(activeTarget.targetType, locale)} · {measurements.distance(activeTarget.distanceMeters)}
              </Text>
              <Text style={styles.activeSummary} numberOfLines={2}>
                {activeTarget.isNarrating
                  ? t('walking.guideSpeaking').replace('{guide}', viewModel.guideName)
                  : t('walking.targetSelected')}
              </Text>
            </View>
            <View style={[styles.audioBadge, activeTarget.isNarrating && styles.audioBadgeActive]}>
              <Text
                style={[
                  styles.audioBadgeIcon,
                  activeTarget.isNarrating && styles.audioBadgeIconActive,
                ]}
              >
                {activeTarget.isNarrating ? '▥' : '•'}
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

        {activeTarget && storyAvailability === 'unavailable' && (
          <Text accessibilityLiveRegion="polite" style={styles.placeMeta}>{t('walking.storyUnavailable')}</Text>
        )}
        {activeTarget && onTellNow && storyAvailability !== 'unavailable' && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('walking.tellNow')}
            accessibilityState={{ disabled: selectionBusy }} disabled={selectionBusy}
            style={styles.guidedButton} onPress={() => onTellNow(activeTarget)}>
            <Text style={styles.guidedButtonText}>{selectionBusy ? t('walking.storyChecking') : t('walking.tellNow')}</Text>
          </TouchableOpacity>
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
                  <Text style={styles.nearbyDistance}>{storyAvailabilityFor?.(place.id) === 'unavailable' ? t('walking.storyUnavailable') : measurements.distance(place.distanceMeters)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : !vehicleMode ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.guidedButton}
            onPress={vehicleMode ? undefined : onChooseGuidedWalk}
        disabled={vehicleMode}
          >
            <Text style={styles.guidedButtonText}>{t('walking.chooseWalk')}</Text>
          </TouchableOpacity>
        ) : null}
        </>}
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


const styles = StyleSheet.create({
  cameraControls: { position: 'absolute', right: spacing.md, zIndex: 30, gap: spacing.sm },
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
  voiceButton: {
    position: 'absolute',
    right: spacing.md,
    bottom: 300,
    zIndex: 32,
    minWidth: 92,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.floating,
  },
  voiceButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  voiceGlyph: { color: colors.danger, fontSize: 12 },
  voiceLabel: { ...typography.caption, color: colors.foreground, fontWeight: '700' },
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
    minHeight: 56,
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
