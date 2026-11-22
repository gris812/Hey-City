import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StoryAvailabilityState } from '@heycity/shared';
import { useAppTranslation } from '../../localization';
import { colors, radius, shadows } from '../../theme';
import { driveCategory, drivePlaceAction, type drivePlace, type driveStory } from '../../presentation/driveView';
import type { ExploreNearbyPlace } from './ExploreHomeView';

type DriveViewProps = {
  candidate?: NonNullable<ReturnType<typeof drivePlace<ExploreNearbyPlace>>>;
  availability: StoryAvailabilityState;
  distance?: string;
  story?: ReturnType<typeof driveStory>;
  onDetails?: (place: ExploreNearbyPlace) => void;
  onTellNow?: (place: ExploreNearbyPlace) => void;
  onClear?: (place: ExploreNearbyPlace) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onTranscript?: () => void;
};

const categoryIcon = {
  city: '▥', region: '▥', museum: '▤', monument: '▲', historic: '▤', cultural: '▤', visitor: 'ⓘ',
  park: '♧', industrial: '▥', nature: '♧', bridge: '⌒', university: '▤', place: '⌖',
};

export const DriveView = React.memo(function DriveView({
  candidate, availability, distance, story, onDetails, onTellNow, onClear, onPause, onResume, onStop, onTranscript,
}: DriveViewProps) {
  const { t } = useAppTranslation();
  if (story) {
    const showPause = story.phase === 'playing';
    const terminalAudio = story.phase === 'text_only' || story.phase === 'error';
    return (
      <View style={styles.panel}>
        <Text style={styles.meta}>{t(`guide.${story.guideId}`)} · {t(`playback.${story.phase}`)}</Text>
        <Text accessibilityRole="header" accessibilityLabel={story.title} numberOfLines={2} style={styles.title}>{story.title}</Text>
        {story.progress !== undefined && (
          <View accessibilityRole="progressbar" accessibilityLabel={t('drive.progress')} accessibilityValue={{ min: 0, max: 100, now: story.progress }} style={styles.progress}>
            <View style={[styles.progressFill, { width: `${story.progress}%` }]} />
          </View>
        )}
        <View style={styles.actions}>
          {story.transportActive && <DriveAction label={t(showPause ? 'tour.pause' : 'tour.resume')} onPress={showPause ? onPause : onResume} primary />}
          {terminalAudio && story.hasText && onTranscript && <DriveAction label={t('walking.transcript')} onPress={onTranscript} primary />}
          <DriveAction label={t(terminalAudio ? 'walking.finishStory' : 'drive.stop')} onPress={onStop} />
        </View>
      </View>
    );
  }
  if (!candidate) {
    return (
      <View style={styles.panel}>
        <Text style={styles.meta}>{t('drive.ambient')}</Text>
      </View>
    );
  }
  const { place, relation } = candidate;
  const category = driveCategory(place.targetType);
  const metadata = (
    <>
      <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.icon}>{categoryIcon[category]}</Text>
      <View style={styles.information}>
        <Text accessibilityLabel={place.title} numberOfLines={2} style={styles.title}>{place.title}</Text>
        <View style={styles.metadata}>
          <Text style={styles.meta}>{t(`drive.category.${category}`)}</Text>
          {distance && <Text style={styles.distance}>{distance}</Text>}
        </View>
      </View>
    </>
  );
  return (
    <View style={styles.panel}>
      <Text style={styles.relation}>{t(`drive.relation.${relation}`)}</Text>
      {onDetails ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${t('walking.openPlace')}: ${place.title}, ${t(`drive.category.${category}`)}${distance ? `, ${distance}` : ''}`}
          onPress={() => onDetails(place)} style={styles.place}>{metadata}</Pressable>
      ) : <View style={styles.place}>{metadata}</View>}
      <Text accessibilityLiveRegion="polite" style={styles.meta}>{t(`drive.availability.${availability}`)}</Text>
      {(onTellNow && drivePlaceAction(availability) || onClear) && (
        <View style={styles.actions}>
          {onTellNow && drivePlaceAction(availability) && <DriveAction label={t('drive.tellNow')} onPress={() => onTellNow(place)} primary />}
          {onClear && <DriveAction label={t('drive.clear')} onPress={() => onClear(place)} />}
        </View>
      )}
    </View>
  );
});

function DriveAction({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [styles.action, primary && styles.primary, pressed && styles.pressed]}>
      <Text style={[styles.actionText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.xl, paddingHorizontal: 16, paddingVertical: 12, gap: 6, ...shadows.floating,
  },
  relation: { color: '#1D5139', fontSize: 16, fontWeight: '700' },
  place: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { color: '#1D5139', fontSize: 23, fontWeight: '700', width: 26, textAlign: 'center', paddingTop: 2 },
  information: { flex: 1, minWidth: 0 },
  title: { color: colors.foreground, fontSize: 27, fontWeight: '800' },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12 },
  meta: { color: '#34453B', fontSize: 17, fontWeight: '600' },
  distance: { color: colors.foreground, fontSize: 22, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  action: {
    flexGrow: 1, flexBasis: 100, minHeight: 64, padding: 8, borderRadius: radius.lg,
    backgroundColor: '#E5F1EA', justifyContent: 'center', alignItems: 'center',
  },
  primary: { backgroundColor: '#0C643A' },
  pressed: { opacity: 0.78 },
  actionText: { color: '#183C2A', fontWeight: '800', fontSize: 18, textAlign: 'center' },
  primaryText: { color: '#FFF' },
  progress: { backgroundColor: '#DDE9E1', height: 7, borderRadius: 4, overflow: 'hidden', marginVertical: 4 },
  progressFill: { backgroundColor: '#0C643A', height: '100%' },
});
