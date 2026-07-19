import React, { useState, useEffect } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteAllHistory, getProfile, HistoryItem } from '../api/me';
import { useAuth } from '../context/AuthContext';
import { shouldLoadProfile } from '../context/appIdentity';
import { useAppTranslation } from '../localization';
import { colors, radius, spacing, typography } from '../theme';
import { tourB, tourBTargets } from '../demo/tours';

const storyPreviewRegion: Region = {
  latitude: 40.7097,
  longitude: -74.0148,
  latitudeDelta: 0.011,
  longitudeDelta: 0.011,
};

export function HistoryScreen() {
  const { identity } = useAuth();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [historyEnabled, setHistoryEnabled] = useState(true);

  useEffect(() => {
    if (!shouldLoadProfile(identity)) {
      setHistoryEnabled(true);
      setItems([]);
      return;
    }

    getProfile().then((p) => {
      setHistoryEnabled(p.historyEnabled);
      setItems(p.history ?? []);
    });
  }, [identity]);

  const handleDeleteHistory = () => {
    if (!shouldLoadProfile(identity)) {
      Alert.alert(t('common.account'), t('live.accountRequired'));
      return;
    }
    Alert.alert(t('settings.deleteHistory'), t('settings.historyHint'), [
      { text: t('sim.stop'), style: 'cancel' },
      {
        text: t('settings.deleteHistory'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAllHistory();
            setItems([]);
          } catch (e) {
            Alert.alert(t('common.error'), (e as Error).message);
          }
        },
      },
    ]);
  };

  if (!historyEnabled) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
          <Text style={styles.title}>{t('history.title')}</Text>
          <Text style={styles.disabled}>{t('history.disabled')}</Text>
        </View>
      </View>
    );
  }

  const renderRouteThumb = (large = false) => (
    <View style={[styles.storyThumb, large && styles.storyThumbLarge]}>
      <MapView
        pointerEvents="none"
        style={StyleSheet.absoluteFillObject}
        initialRegion={storyPreviewRegion}
        region={storyPreviewRegion}
      >
        <Polyline coordinates={tourB.fullRouteCoordinates} strokeColor={colors.primaryOrange} strokeWidth={4} />
        {tourBTargets.slice(0, 4).map((target) => (
          <Marker key={target.id} coordinate={target.coordinates} title={target.name} />
        ))}
      </MapView>
      <View style={styles.thumbBadge}>
        <Text style={styles.storyThumbText}>Route</Text>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: HistoryItem }) => {
    const guideName = item.guideId ? t(`guide.${item.guideId}`) : 'Dana or Arthur';
    const stops = item.visitedTargetIds?.length || 4;
    const title = item.placeId ?? 'Downtown Manhattan Walk';
    const date = new Date(item.completedAt ?? item.timestamp).toLocaleDateString();

    return (
    <TouchableOpacity
      accessibilityLabel={`${title}, ${stops} stops, ${guideName}`}
      activeOpacity={0.86}
      style={styles.item}
    >
      {renderRouteThumb()}
      <View style={styles.storyCopy}>
        <Text style={styles.itemType}>{item.type === 'poi_played' ? 'City Story' : 'Completed walk'}</Text>
        <Text style={styles.itemPlace}>{title}</Text>
        <Text style={styles.itemMeta}>{guideName} - {stops} stops - 52 min - 2.3 km</Text>
        <Text style={styles.itemTime}>{date}</Text>
      </View>
    </TouchableOpacity>
    );
  };

  const startFirstWalk = () => {
    navigation.navigate('Explore' as never);
  };

  const canDeleteHistory = shouldLoadProfile(identity) && items.length > 0;

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{t('history.title')}</Text>
            <Text style={styles.countLabel}>{items.length} walks</Text>
          </View>
        </View>
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              {renderRouteThumb(true)}
              <Text style={styles.emptyTitle}>Start your first walk</Text>
              <Text style={styles.empty}>
                Completed walks and saved City Stories will appear here.
              </Text>
              <TouchableOpacity
                accessibilityLabel="Start Your First Walk"
                style={styles.emptyButton}
                onPress={startFirstWalk}
              >
                <Text style={styles.emptyButtonText}>Start Your First Walk</Text>
              </TouchableOpacity>
            </View>
          }
        />
        {canDeleteHistory && (
          <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteHistory}>
            <Text style={styles.dangerButtonText}>{t('settings.deleteHistory')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  title: { ...typography.title, color: colors.foreground, marginBottom: spacing.md },
  headerRow: { marginBottom: spacing.md },
  countLabel: { ...typography.body, color: colors.textMuted },
  listContent: { paddingBottom: spacing.xl },
  disabled: { ...typography.body, color: colors.textMuted },
  empty: { ...typography.body, color: colors.textMuted, marginTop: spacing.lg },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storyThumb: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.primaryOrangeLight,
    overflow: 'hidden',
  },
  storyThumbLarge: {
    width: '100%',
    height: 180,
    marginBottom: spacing.md,
  },
  thumbBadge: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  storyThumbText: { ...typography.caption, color: colors.primaryOrange, fontWeight: '600' },
  storyCopy: { flex: 1 },
  itemType: { ...typography.caption, color: colors.warning, marginBottom: spacing.xs },
  itemPlace: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  itemMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  itemTime: { ...typography.caption, color: colors.textMuted, maxWidth: 78 },
  emptyCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyTitle: { ...typography.title, color: colors.foreground, fontSize: 22, lineHeight: 28 },
  emptyButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primaryOrange,
    marginTop: spacing.md,
  },
  emptyButtonText: { ...typography.label, color: colors.surface },
  dangerButton: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  dangerButtonText: { ...typography.caption, color: colors.danger },
});
