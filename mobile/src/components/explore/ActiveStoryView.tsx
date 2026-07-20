import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, type LatLng, type Region } from 'react-native-maps';
import { colors, radius, spacing } from '../../theme';
import { NarrativeOverlay } from './NarrativeOverlay';

export type ActiveStoryMarker = {
  id: string;
  coordinate: LatLng;
  title: string;
  pinColor: string;
};

export type ActiveStoryViewProps = {
  height: number;
  region: Region;
  completedRouteCoordinates: LatLng[];
  upcomingRouteCoordinates: LatLng[];
  targets: ActiveStoryMarker[];
  userCoordinate?: LatLng;
  title: string;
  guideName: string;
  text: string;
  playbackState: 'playing' | 'paused' | 'completed';
  progress?: number;
  autoContinueRemainingMs?: number;
  onPause: () => void;
  onResume: () => void;
  onContinue: () => void;
  onTranscript: () => void;
};

export function ActiveStoryView({
  height,
  region,
  completedRouteCoordinates,
  upcomingRouteCoordinates,
  targets,
  userCoordinate,
  title,
  guideName,
  text,
  playbackState,
  progress,
  autoContinueRemainingMs,
  onPause,
  onResume,
  onContinue,
  onTranscript,
}: ActiveStoryViewProps) {
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
      <NarrativeOverlay
        title={title}
        guideName={guideName}
        text={text}
        playbackState={playbackState}
        progress={progress}
        autoContinueRemainingMs={autoContinueRemainingMs}
        onPause={onPause}
        onResume={onResume}
        onContinue={onContinue}
        onTranscript={onTranscript}
      />
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
});
