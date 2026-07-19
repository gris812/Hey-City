import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Image,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  finishDriveStory,
  pingDriveSession,
  PingResult,
  startDriveSession,
  stopDriveSession,
  StoryFinishReason,
} from '../api/drive';
import { getProfile } from '../api/me';
import { config } from '../config';
import { LiveControls } from '../components/live/LiveControls';
import { LiveStatusPill } from '../components/live/LiveStatusPill';
import { StoryPanel } from '../components/live/StoryPanel';
import {
  LivePresentationState,
  mapDriveSessionToPresentation,
  type PlaybackState,
} from '../presentation';
import { colors, radius, spacing, typography } from '../theme';
import { useAuth } from '../context/AuthContext';
import {
  guestProfileDefaults,
  shouldLoadProfile,
} from '../context/appIdentity';
import { useAppTranslation } from '../localization';
import type { GuidePreference, SupportedLocale } from '../localization/preferences';
import { NarrativeOverlay } from '../components/explore/NarrativeOverlay';
import { tourB, tourBTargets } from '../demo/tours';
import {
  analyzeLocationEvent,
  beginNarrative,
  completeNarrative,
  continueToNextTarget,
  createInitialGuidedTourState,
  defaultExplorationMode,
  explorationModes,
  getCurrentTarget,
  getNarrativeTarget,
  pauseGuidedTour,
  resumeGuidedTour,
  startGuidedTour,
  tickAutoContinue,
  tourBLocationEvents,
  type ExplorationMode,
  type GuidedTourState,
} from '../demo/guidedTour';

const THEME_TAGS = [
  'history',
  'architecture',
  'cinema_culture',
  'food_coffee',
  'religion',
  'engineering_infrastructure',
  'mixed',
];

const STYLES = [
  'documentary',
  'light_ironic',
  'detective',
  'romantic',
  'tech',
  'mini_lecture',
];

const guideImages = {
  dana: require('../../assets/Guides/Dana.png'),
  arthur: require('../../assets/Guides/Artur.png'),
} as const;

const guideSelectionImages = {
  dana: require('../../assets/Guides/DanaSelection.png'),
  arthur: require('../../assets/Guides/ArturSelection.png'),
} as const;

const guideProfiles = {
  dana: {
    role: 'Urban Companion',
    description: {
      en: 'Warm, curious, conversational. Dana helps you notice hidden corners and local city details.',
      ru: 'Тёплая, любопытная, живая. Dana помогает замечать скрытые детали города.',
    },
    interests: ['Hidden Gems', 'Local Life', 'Atmosphere'],
    sample: 'Look up - this corner is easy to miss.',
  },
  arthur: {
    role: 'Historian',
    description: {
      en: 'Analytical, architectural, precise. Arthur brings city history to life with context and detail.',
      ru: 'Структурный, точный, внимательный. Arthur объясняет город через историю и архитектуру.',
    },
    interests: ['History', 'Architecture', 'Context'],
    sample: 'This building connects finance and civic history.',
  },
} as const;

const interestOptions = [
  'History',
  'Architecture',
  'Hidden Gems',
  'Local Life',
  'Food & Drink',
  'Art & Culture',
  'Atmosphere',
  'Context',
];

type SharePreviewState = 'ready' | 'invalid_link' | 'unsupported_location';

export function LiveScreen() {
  const { identity, preferences, updatePreferences } = useAuth();
  const { t } = useAppTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { height: windowHeight } = useWindowDimensions();
  const [mode, setMode] = useState<ExplorationMode>(defaultExplorationMode);
  const [driveDiscoveryOn, setDriveDiscoveryOn] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themes, setThemes] = useState<string[]>(['mixed']);
  const [style, setStyle] = useState('documentary');
  const [lengthSec, setLengthSec] = useState(90);
  const [leadTimeMin, setLeadTimeMin] = useState(2);
  const [autoplay, setAutoplay] = useState(true);
  const [muted, setMuted] = useState(false);
  const [lastResult, setLastResult] = useState<PingResult | null>(null);
  const [playingName, setPlayingName] = useState<string | null>(null);
  const [localPlaybackState, setLocalPlaybackState] = useState<PlaybackState>('idle');
  const [lastMotion, setLastMotion] = useState<{ speedKmh: number; heading: number } | null>(null);
  const [tourState, setTourState] = useState<GuidedTourState>(() =>
    createInitialGuidedTourState(preferences.preferredGuideId, preferences.guideLanguage)
  );
  const [tourEventIndex, setTourEventIndex] = useState(0);
  const [narrativeRemainingMs, setNarrativeRemainingMs] = useState<number | null>(null);
  const [routeSaveModal, setRouteSaveModal] = useState<'guest' | 'saved' | null>(null);
  const [tourPreferencesOpen, setTourPreferencesOpen] = useState(false);
  const [guideProfileOpen, setGuideProfileOpen] = useState<GuidePreference | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(['Hidden Gems', 'Local Life']);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
  const [sharePreviewState, setSharePreviewState] = useState<SharePreviewState>('ready');
  const [exploreNarrativeTargetId, setExploreNarrativeTargetId] = useState<string | null>(null);
  const [exploreNarrativePaused, setExploreNarrativePaused] = useState(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const profileRef = useRef<Awaited<ReturnType<typeof getProfile>> | null>(null);
  const lastHeadingRef = useRef(0);
  const activeGuideId = tourState.guideId;
  const activeGuideLanguage = tourState.guideLanguage;
  const defaultPresentation: LivePresentationState = {
    discoveryPhase: 'exploring',
    playbackState: 'idle',
    activeGuideId: preferences.preferredGuideId,
    presentationMode: 'map',
    transcriptPreview: t(`live.walkNaturally.${preferences.preferredGuideId}`),
  };
  const currentTarget = getCurrentTarget(tourState);
  const narrativeTarget = getNarrativeTarget(tourState);
  const exploreNarrativeTarget = tourBTargets.find((target) => target.id === exploreNarrativeTargetId);
  const activeNarrative =
    narrativeTarget?.narratives[activeGuideId][activeGuideLanguage];
  const activeExploreNarrative =
    exploreNarrativeTarget?.narratives[preferences.preferredGuideId][preferences.guideLanguage];
  const currentTargetNarrative =
    currentTarget?.narratives[activeGuideId][activeGuideLanguage];
  const currentTargetTitle = currentTargetNarrative?.title ?? currentTarget?.name ?? '-';
  const visibleExplorationModes = explorationModes.filter((item) => item !== 'drive_discovery');
  const passiveMapUserCoordinate = exploreNarrativeTarget?.coordinates ?? tourState.location ?? tourB.startCoordinate;
  const approachText =
    tourState.narrativeState === 'approach' && activeNarrative?.approachText
      ? activeNarrative.approachText
      : null;
  const guidedMapHeight = Math.max(520, windowHeight - insets.top - insets.bottom - 250);
  const completedTargetIndex = tourState.completedTargetIds.length
    ? Math.max(
        0,
        tourBTargets.findIndex(
          (target) => target.id === tourState.completedTargetIds[tourState.completedTargetIds.length - 1]
        )
      )
    : 0;
  const completedRouteCoordinates = tourState.completedTargetIds.length
    ? tourBTargets.slice(0, completedTargetIndex + 1).flatMap((target, index) =>
        index === 0 ? target.route.routeCoordinates : target.route.routeCoordinates.slice(1)
      )
    : [tourB.startCoordinate];
  const upcomingRouteCoordinates = tourBTargets
    .slice(Math.max(0, tourState.currentTargetIndex))
    .flatMap((target, index) =>
      index === 0 ? target.route.routeCoordinates : target.route.routeCoordinates.slice(1)
    );
  const tourRegion: Region = useMemo(
    () => ({
      latitude: 40.7097,
      longitude: -74.0148,
      latitudeDelta: 0.009,
      longitudeDelta: 0.009,
    }),
    []
  );

  const startSession = useCallback(async () => {
    setSessionError(null);
    if (!shouldLoadProfile(identity)) {
      setSessionId('guest-drive-demo');
      setDriveDiscoveryOn(true);
      setLocalPlaybackState('idle');
      setLastResult(null);
      setPlayingName(null);
      return;
    }

    try {
      const profile = profileRef.current ?? (await getProfile());
      profileRef.current = profile;
      const { sessionId: id } = await startDriveSession({
        themeTags: themes,
        narrationStyle: style,
        lengthSec,
        leadTimeMin,
        voiceId: profile.driveDiscovery.voiceId,
        language: preferences.guideLanguage,
        autoplay,
      });
      setSessionId(id);
      setDriveDiscoveryOn(true);
      setLocalPlaybackState('idle');
    } catch (e) {
      setSessionError((e as Error).message);
      console.error(e);
    }
  }, [identity, preferences.guideLanguage, themes, style, lengthSec, leadTimeMin, autoplay, t]);

  const stopSession = useCallback(async () => {
    if (sessionId) {
      if (shouldLoadProfile(identity)) {
        try {
          await stopDriveSession(sessionId);
        } catch (_) {}
      }
      setSessionId(null);
      setDriveDiscoveryOn(false);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      setLastResult(null);
      setPlayingName(null);
      setLocalPlaybackState('idle');
      setSessionError(null);
    }
  }, [identity, sessionId]);

  useEffect(() => {
    if (!shouldLoadProfile(identity)) {
      profileRef.current = null;
      setThemes(guestProfileDefaults.themeTags);
      setStyle(guestProfileDefaults.narrationStyle);
      setAutoplay(guestProfileDefaults.autoplay);
      return;
    }

    getProfile().then((p) => {
      profileRef.current = p;
      setThemes(p.driveDiscovery.themeTags.length ? p.driveDiscovery.themeTags : ['mixed']);
      setStyle(p.driveDiscovery.narrationStyle);
      setLengthSec(p.driveDiscovery.lengthSec);
      setLeadTimeMin(p.driveDiscovery.leadTimeMin);
      setAutoplay(p.driveDiscovery.autoplay);
    });
  }, [identity]);

  useEffect(() => {
    if (!sessionId || muted || !shouldLoadProfile(identity)) return;

    const runPing = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const rawHeading = loc.coords.heading;
        const heading =
          typeof rawHeading === 'number' && rawHeading >= 0
            ? rawHeading
            : lastHeadingRef.current;
        lastHeadingRef.current = heading;

        const speedMps =
          typeof loc.coords.speed === 'number' && loc.coords.speed > 0
            ? loc.coords.speed
            : 0;
        const speedKmh = speedMps * 3.6;
        setLastMotion({ speedKmh, heading });

        const result = await pingDriveSession(
          sessionId,
          loc.coords.latitude,
          loc.coords.longitude,
          heading,
          speedKmh,
          Date.now()
        );
        setLastResult(result);
        if (result.nextAction === 'PLAY' && result.poi) {
          setPlayingName(result.poi.name);
          setLocalPlaybackState((current) => (current === 'paused' ? current : 'playing'));
          if (result.audioUrl) {
            // TODO: play audio with expo-av
          }
        } else if (result.decision?.type !== 'hold' || result.decision.reason !== 'already_listening') {
          setPlayingName(null);
          setLocalPlaybackState((current) => (current === 'paused' ? current : 'idle'));
        }
      } catch (_) {}
    };

    runPing();
    const id = setInterval(runPing, config.pingIntervalSec * 1000);
    pingIntervalRef.current = id;
    return () => {
      clearInterval(id);
      pingIntervalRef.current = null;
    };
  }, [identity, sessionId, muted]);

  const toggleTheme = (t: string) => {
    setThemes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const finishStory = async (reason: StoryFinishReason) => {
    if (!sessionId) return;
    setSessionError(null);
    try {
      const result = await finishDriveStory(sessionId, reason);
      setPlayingName(null);
      setLocalPlaybackState(reason === 'paused' ? 'paused' : 'completed');
      setLastResult({
        nextAction: 'NONE',
        decision: {
          type: 'hold',
          reason: result.activeStoryWasPlaying ? 'cooldown_active' : 'no_candidate',
        },
      });
    } catch (e) {
      setSessionError((e as Error).message);
      console.error(e);
    }
  };

  const presentation = mapDriveSessionToPresentation(lastResult, {
    sessionActive: Boolean(sessionId),
    playbackState: localPlaybackState,
  });

  const pausePlayback = () => {
    if (localPlaybackState === 'playing' || localPlaybackState === 'loading') {
      setLocalPlaybackState('paused');
    }
  };

  const resumePlayback = () => {
    if (localPlaybackState === 'paused') {
      setLocalPlaybackState(playingName ? 'playing' : 'idle');
    }
  };

  useEffect(() => {
    setTourState((current) => {
      if (current.journeyState !== 'idle' && current.journeyState !== 'completed') {
        return current;
      }
      return {
        ...current,
        guideId: preferences.preferredGuideId,
        guideLanguage: preferences.guideLanguage,
      };
    });
  }, [preferences.preferredGuideId, preferences.guideLanguage]);

  useEffect(() => {
    setExploreNarrativeTargetId(null);
    setExploreNarrativePaused(false);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'guided_tour') return;
    if (tourState.isPaused) return;
    if (
      tourState.journeyState === 'idle' ||
      tourState.journeyState === 'narrating' ||
      tourState.journeyState === 'waiting_to_continue' ||
      tourState.journeyState === 'completed'
    ) {
      return;
    }

    const timer = setTimeout(() => {
      const event = tourBLocationEvents[tourEventIndex];
      if (!event) return;
      setLastMotion({ speedKmh: event.speedKmh, heading: event.heading });
      setTourState((current) => {
        const analyzed = analyzeLocationEvent(current, event);
        if (analyzed.journeyState === 'arrived') {
          const target = getCurrentTarget(analyzed);
          setNarrativeRemainingMs(
            (target?.narratives[activeGuideId][activeGuideLanguage].estimatedDurationSec ?? 8) *
              1000
          );
          return beginNarrative(analyzed);
        }
        return analyzed;
      });
      setTourEventIndex((index) => index + 1);
    }, 700);

    return () => clearTimeout(timer);
  }, [activeGuideId, activeGuideLanguage, mode, tourEventIndex, tourState]);

  useEffect(() => {
    if (tourState.journeyState !== 'narrating' || tourState.isPaused || narrativeRemainingMs === null) return;
    if (narrativeRemainingMs <= 0) {
      setTourState((current) => completeNarrative(current));
      setNarrativeRemainingMs(null);
      return;
    }
    const timer = setTimeout(() => setNarrativeRemainingMs((value) => Math.max(0, (value ?? 0) - 1000)), 1000);
    return () => clearTimeout(timer);
  }, [narrativeRemainingMs, tourState.isPaused, tourState.journeyState]);

  useEffect(() => {
    if (tourState.journeyState !== 'waiting_to_continue' || tourState.isPaused) return;
    const timer = setTimeout(() => setTourState((current) => tickAutoContinue(current, 1000)), 1000);
    return () => clearTimeout(timer);
  }, [tourState]);

  const startTour = () => {
    setMode('guided_tour');
    setTourEventIndex(0);
    setNarrativeRemainingMs(null);
    setTourPreferencesOpen(false);
    setTranscriptOpen(false);
    setTourState(startGuidedTour(createInitialGuidedTourState(preferences.preferredGuideId, preferences.guideLanguage)));
  };

  const stopTour = () => {
    setTourState((current) => createInitialGuidedTourState(current.guideId, current.guideLanguage));
    setTourEventIndex(0);
    setNarrativeRemainingMs(null);
  };

  const continueTour = () => {
    setNarrativeRemainingMs(null);
    setTourState((current) => continueToNextTarget(completeNarrative(current)));
  };

  const pauseTour = () => setTourState((current) => pauseGuidedTour(current));
  const resumeTour = () => setTourState((current) => resumeGuidedTour(current));
  const confirmStopTour = () => {
    Alert.alert('End tour?', 'Your current walk will stop. The route summary remains available after completion.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Tour', style: 'destructive', onPress: stopTour },
    ]);
  };
  const selectGuide = async (guideId: GuidePreference) => {
    await updatePreferences({ preferredGuideId: guideId });
    setSelectedInterests([...guideProfiles[guideId].interests.slice(0, 2)]);
  };
  const selectLanguage = async (guideLanguage: SupportedLocale) => {
    await updatePreferences({ guideLanguage });
  };
  const toggleInterest = (interest: string) => {
    setSelectedInterests((current) => {
      if (current.includes(interest)) return current.filter((item) => item !== interest);
      if (current.length >= 3) {
        Alert.alert('Choose up to 3 interests', 'Remove one interest before adding another.');
        return current;
      }
      return [...current, interest];
    });
  };
  const closeExploreNarrative = () => {
    setExploreNarrativeTargetId(null);
    setExploreNarrativePaused(false);
    setPlayingName(null);
    setLocalPlaybackState((current) => (current === 'paused' || current === 'playing' ? 'idle' : current));
  };
  const triggerExploreNarrative = (targetId: string) => {
    const target = tourBTargets.find((item) => item.id === targetId);
    if (!target) return;
    setExploreNarrativeTargetId(targetId);
    setExploreNarrativePaused(false);
    setPlayingName(target.narratives[preferences.preferredGuideId][preferences.guideLanguage].title);
    setLocalPlaybackState('playing');
  };
  const saveRoute = () => {
    if (identity.status === 'authenticated') {
      setRouteSaveModal('saved');
      return;
    }
    setRouteSaveModal('guest');
  };
  const shareRoute = () => {
    setSharePreviewState('ready');
    setSharePreviewOpen(true);
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop:
              mode === 'city_explorer'
                ? Math.max(spacing.md, insets.top - spacing.sm)
                : insets.top + spacing.lg,
            paddingBottom: tabBarHeight + insets.bottom + 48,
          },
        ]}
      >
      {mode !== 'city_explorer' && (
        <>
          <Text style={styles.screenTitle}>Financial District</Text>
          <View style={styles.modeRow}>
            {visibleExplorationModes.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.modeChip, mode === item && styles.modeChipActive]}
                onPress={() => setMode(item)}
              >
                <Text style={[styles.modeChipText, mode === item && styles.modeChipTextActive]}>
                  {item === 'city_explorer' ? 'Explore' : t('tour.guidedTour')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {mode === 'city_explorer' && (
        <View style={[styles.exploreStage, { height: Math.max(640, windowHeight - tabBarHeight - insets.top - 8) }]}>
          <MapView style={StyleSheet.absoluteFillObject} initialRegion={tourRegion} region={tourRegion}>
            <Marker
              coordinate={passiveMapUserCoordinate}
              title={t('tour.you')}
              pinColor={colors.dana}
            />
            {__DEV__ &&
              tourBTargets.map((target) => (
                <Marker
                  key={target.id}
                  coordinate={target.coordinates}
                  title={target.narratives[preferences.preferredGuideId][preferences.guideLanguage].title}
                  pinColor={exploreNarrativeTargetId === target.id ? colors.warning : '#8E8E93'}
                  onPress={() => triggerExploreNarrative(target.id)}
                />
              ))}
          </MapView>
          <View style={styles.exploreTopOverlay}>
            <Text
              style={styles.areaChip}
              numberOfLines={1}
              maxFontSizeMultiplier={1}
            >
              Financial District - Nearby
            </Text>
            <View style={styles.modeRowCompact}>
              {visibleExplorationModes.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.modeChipCompact, mode === item && styles.modeChipCompactActive]}
                  onPress={() => setMode(item)}
                >
                  <Text
                    style={[styles.modeChipCompactText, mode === item && styles.modeChipCompactTextActive]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1}
                  >
                    {item === 'city_explorer' ? 'Explore' : t('tour.guidedTour')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {activeExploreNarrative && exploreNarrativeTarget && (
            <NarrativeOverlay
              title={activeExploreNarrative.title}
              guideName={t(`guide.${preferences.preferredGuideId}`)}
              text={activeExploreNarrative.arrivalText}
              playbackState={exploreNarrativePaused ? 'paused' : 'playing'}
              progress={1}
              onPause={() => {
                setExploreNarrativePaused(true);
                setLocalPlaybackState('paused');
              }}
              onResume={() => {
                setExploreNarrativePaused(false);
                setLocalPlaybackState('playing');
              }}
              onContinue={closeExploreNarrative}
              onTranscript={() => setTranscriptOpen(true)}
            />
          )}
          <View style={styles.exploreGuideCapsule}>
            <View style={styles.capsuleHeaderRow}>
              <Image source={guideImages[preferences.preferredGuideId]} style={styles.cityExplorerGuide} resizeMode="cover" />
              <View style={styles.cityExplorerText}>
                <Text style={styles.capsuleGuideName} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {t(`guide.${preferences.preferredGuideId}`)}
                </Text>
              </View>
              <TouchableOpacity style={styles.capsuleSecondaryButton} onPress={() => setTourPreferencesOpen(true)}>
                <Text
                  style={styles.capsuleSecondaryText}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1}
                >
                  Preview Route
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              style={styles.contextTitle}
              numberOfLines={2}
              maxFontSizeMultiplier={1}
            >
              Downtown Manhattan Walk
            </Text>
            <Text
              style={styles.capsuleBody}
              numberOfLines={2}
              maxFontSizeMultiplier={1}
            >
              {t(`live.walkNaturally.${preferences.preferredGuideId}`)}
            </Text>
            <Text style={styles.routeMetaText} numberOfLines={1} maxFontSizeMultiplier={1}>
              4 stops - 2.3 km - 52 min
            </Text>
            <TouchableOpacity style={styles.previewButton} onPress={startTour}>
              <Text style={styles.previewButtonText} maxFontSizeMultiplier={1}>Start Walk</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {mode === 'guided_tour' && tourState.journeyState === 'completed' && (
        <View style={styles.completionScreen}>
          <View style={styles.completionReward}>
            <Text style={styles.completionRewardIcon}>✓</Text>
          </View>
          <Text style={styles.completionTitle}>Downtown Manhattan</Text>
          <Text style={styles.completionSubtitle}>Walk complete!</Text>
          <Text style={styles.completionSubtitle}>
            {t('tour.visitedCount').replace('{count}', String(tourBTargets.length))}
          </Text>
          <View style={styles.completionMetricRow}>
            <View style={styles.completionMetricCard}>
              <Text style={styles.completionMetricValue}>4</Text>
              <Text style={styles.completionMetricLabel}>Stops</Text>
            </View>
            <View style={styles.completionMetricCard}>
              <Text style={styles.completionMetricValue}>2.3 km</Text>
              <Text style={styles.completionMetricLabel}>Distance</Text>
            </View>
            <View style={styles.completionMetricCard}>
              <Text style={styles.completionMetricValue}>52 min</Text>
              <Text style={styles.completionMetricLabel}>Duration</Text>
            </View>
          </View>
          <View style={styles.completionGuideNote}>
            <Text style={styles.completionGuideName}>{t(`guide.${activeGuideId}`)}</Text>
            <Text style={styles.completionGuideText}>
              {tourB.completionNarratives[activeGuideId][activeGuideLanguage]}
            </Text>
          </View>
          <View style={styles.completedList}>
            {tourBTargets.map((target) => (
              <View key={target.id} style={styles.completedRow}>
                <Text style={styles.completedCheck}>✓</Text>
                <Text style={styles.completedName}>
                  {target.narratives[activeGuideId][activeGuideLanguage].title}
                </Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={[styles.completionButton, styles.completionButtonPrimary]} onPress={saveRoute}>
            <Text style={styles.completionButtonPrimaryText}>{t('tour.saveRoute')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.completionButton} onPress={shareRoute}>
            <Text style={styles.completionButtonText}>Share Route</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.completionButton} onPress={stopTour}>
            <Text style={styles.completionButtonText}>{t('tour.runAgain')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'guided_tour' && tourState.journeyState !== 'completed' && (
        <View style={[styles.mapWrap, { height: guidedMapHeight }]}>
          <MapView style={StyleSheet.absoluteFillObject} initialRegion={tourRegion} region={tourRegion}>
            {completedRouteCoordinates.length > 1 && (
              <Polyline coordinates={completedRouteCoordinates} strokeColor={colors.routeCompleted} strokeWidth={5} />
            )}
            {upcomingRouteCoordinates.length > 1 && (
              <Polyline coordinates={upcomingRouteCoordinates} strokeColor={colors.primaryOrange} strokeWidth={5} />
            )}
            {tourBTargets.map((target) => (
              <Marker
                key={target.id}
                coordinate={target.coordinates}
                title={target.narratives[activeGuideId][activeGuideLanguage].title}
                pinColor={
                  tourState.completedTargetIds.includes(target.id)
                    ? '#34C759'
                    : currentTarget?.id === target.id
                      ? colors.warning
                      : '#8E8E93'
                }
              />
            ))}
            {tourState.location && (
              <Marker
                coordinate={tourState.location}
                title={t('tour.you')}
                pinColor={colors.dana}
              />
            )}
          </MapView>
          {(tourState.journeyState === 'narrating' || tourState.journeyState === 'waiting_to_continue') && activeNarrative && narrativeTarget && (
            <NarrativeOverlay
              title={activeNarrative.title}
              guideName={t(`guide.${activeGuideId}`)}
              text={activeNarrative.arrivalText}
              playbackState={tourState.isPaused ? 'paused' : tourState.journeyState === 'waiting_to_continue' ? 'completed' : 'playing'}
              progress={
                narrativeRemainingMs === null
                  ? 1
                  : 1 - narrativeRemainingMs / Math.max(1, activeNarrative.estimatedDurationSec * 1000)
              }
              autoContinueRemainingMs={tourState.autoContinueRemainingMs}
              onPause={pauseTour}
              onResume={resumeTour}
              onContinue={continueTour}
              onTranscript={() => setTranscriptOpen(true)}
            />
          )}
          <View style={styles.guidedTopOverlay}>
            <Text style={styles.guidedTopChip}>
              Next: {currentTargetTitle} - 8 min walk
            </Text>
            <Text style={styles.guidedStopChip}>
              Stop {currentTarget?.sequence ?? 1} of {tourBTargets.length}
            </Text>
          </View>
          <View style={styles.mapInfoOverlay}>
            <View style={styles.tourHeaderRow}>
              <Image source={guideImages[activeGuideId]} style={styles.guidedGuideAvatar} resizeMode="cover" />
              <View style={styles.tourInfoText}>
                <Text style={styles.currentObjectLabel}>{t(`guide.${activeGuideId}`)}</Text>
                <Text style={styles.contextTitle}>Walking to {currentTargetTitle}</Text>
                <Text style={styles.motionLabel}>
                  Next story starts when you arrive.
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel={tourState.isPaused ? t('tour.resume') : t('tour.pause')}
                style={styles.compactPauseButton}
                onPress={tourState.isPaused ? resumeTour : pauseTour}
              >
                <Text style={styles.compactPauseText}>
                  {tourState.isPaused ? t('tour.resumeShort') : 'Ⅱ'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Open transcript"
                style={styles.compactPauseButton}
                onPress={() => setTranscriptOpen(true)}
              >
                <Text style={styles.compactPauseText}>☰</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="End Tour"
                style={styles.compactPauseButton}
                onPress={confirmStopTour}
              >
                <Text style={styles.compactPauseText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.mapMetrics}>
              <Text style={styles.motionLabel}>
                {t('tour.state')}: {t(`journey.${tourState.journeyState}`)}
              </Text>
              {typeof tourState.distanceToCurrentTargetMeters === 'number' && (
                <Text style={styles.motionLabel}>
                  {t('tour.distance')}: {Math.round(tourState.distanceToCurrentTargetMeters)} m
                </Text>
              )}
            </View>

            {approachText && (
              <View style={styles.approachBox}>
                <Text style={styles.settingsLabel}>{t('tour.approach')}</Text>
                <Text style={styles.motionLabel}>{approachText}</Text>
              </View>
            )}

            <View style={styles.controlsRow}>
              <TouchableOpacity style={[styles.controlButton, styles.controlButtonPrimary]} onPress={tourState.isPaused ? resumeTour : pauseTour}>
                <Text style={[styles.controlButtonText, styles.controlButtonTextPrimary]}>
                  {tourState.isPaused ? t('tour.resume') : t('tour.pause')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.controlButton} onPress={() => setTranscriptOpen(true)}>
                <Text style={styles.controlButtonText}>Transcript</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.controlButton} onPress={confirmStopTour}>
                <Text style={styles.controlButtonText}>End Tour</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {mode === 'drive_discovery' && (
        <>
          <TouchableOpacity
            style={styles.settingsTrigger}
            onPress={() => setSettingsOpen(!settingsOpen)}
          >
            <Text style={styles.settingsTriggerText}>
              {settingsOpen ? 'Скрыть настройки' : 'Настройки Drive Discovery'}
            </Text>
          </TouchableOpacity>

          {settingsOpen && (
            <View style={styles.settingsBox}>
              <Text style={styles.settingsLabel}>Тематики</Text>
              <View style={styles.chipRow}>
                {THEME_TAGS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, themes.includes(t) && styles.chipActive]}
                    onPress={() => toggleTheme(t)}
                  >
                    <Text style={[styles.chipText, themes.includes(t) && styles.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.settingsLabel}>Стиль: {style}</Text>
              <View style={styles.chipRow}>
                {STYLES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, style === s && styles.chipActive]}
                    onPress={() => setStyle(s)}
                  >
                    <Text style={[styles.chipText, style === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.settingsLabel}>Длина: {lengthSec} сек</Text>
              <Text style={styles.settingsLabel}>Начинать за: {leadTimeMin} мин до подъезда</Text>
              <View style={styles.row}>
                <Text style={styles.settingsLabel}>Авто-плей</Text>
                <Switch value={autoplay} onValueChange={setAutoplay} />
              </View>
            </View>
          )}

          {sessionError && (
            <Text style={styles.errorText}>{sessionError}</Text>
          )}

          {!sessionId ? (
            <StoryPanel
              presentation={presentation}
              actions={
                <LiveControls
                  presentation={presentation}
                  muted={muted}
                  sessionActive={false}
                  onStartSession={startSession}
                  onEndSession={stopSession}
                  onPausePlayback={pausePlayback}
                  onResumePlayback={resumePlayback}
                  onSkipStory={() => void finishStory('skipped')}
                  onToggleMute={() => setMuted(!muted)}
                />
              }
            />
          ) : (
            <>
              <LiveStatusPill presentation={presentation} />
              <View style={styles.panelWrap}>
                <StoryPanel
                  presentation={presentation}
                  actions={
                    <LiveControls
                      presentation={presentation}
                      muted={muted}
                      sessionActive
                      onStartSession={startSession}
                      onEndSession={stopSession}
                      onPausePlayback={pausePlayback}
                      onResumePlayback={resumePlayback}
                      onSkipStory={() => void finishStory('skipped')}
                      onToggleMute={() => setMuted(!muted)}
                    />
                  }
                />
              </View>
              {lastResult?.estimatedDurationSec && (
                <Text style={styles.playingLabel}>
                  Estimated story length: {lastResult.estimatedDurationSec} sec
                </Text>
              )}
              {lastMotion && (
                <Text style={styles.motionLabel}>
                  Speed {lastMotion.speedKmh.toFixed(1)} km/h · Heading {Math.round(lastMotion.heading)}°
                </Text>
              )}
              {lastResult?.circuitLimited && (
                <Text style={styles.warnText}>Временно ограничено (лимиты API)</Text>
              )}
            </>
          )}
        </>
      )}

      </ScrollView>

      <Modal visible={tourPreferencesOpen} animationType="slide">
        <ScrollView style={styles.modalScreen} contentContainerStyle={[styles.modalContent, { paddingTop: insets.top + spacing.lg }]}>
          <Text style={styles.modalTitle}>Start your walk</Text>
          <Text style={styles.modalSubtitle}>Choose your guide, interests and language. Defaults work if you skip this.</Text>

          <View style={styles.preferenceGuideRow}>
            {(['dana', 'arthur'] as GuidePreference[]).map((guideId) => {
              const selected = preferences.preferredGuideId === guideId;
              return (
                <TouchableOpacity
                  key={guideId}
                  style={[styles.preferenceGuideCard, selected && styles.preferenceGuideCardSelected]}
                  accessibilityLabel={`Select ${t(`guide.${guideId}`)}`}
                  onPress={() => void selectGuide(guideId)}
                >
                  <TouchableOpacity
                    accessibilityLabel={`Open ${t(`guide.${guideId}`)} profile`}
                    onPress={() => setGuideProfileOpen(guideId)}
                  >
                    <Image source={guideImages[guideId]} style={styles.preferenceGuideImage} resizeMode="cover" />
                  </TouchableOpacity>
                  <Text style={styles.preferenceGuideName}>{t(`guide.${guideId}`)}</Text>
                  <Text style={styles.preferenceGuideRole}>{guideProfiles[guideId].role}</Text>
                  {selected && <Text style={styles.preferenceCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionHeading}>Interests - choose up to 3</Text>
          <View style={styles.chipRow}>
            {interestOptions.map((interest) => {
              const selected = selectedInterests.includes(interest);
              return (
                <TouchableOpacity
                  key={interest}
                  style={[styles.chip, selected && styles.chipActive]}
                  accessibilityLabel={`${selected ? 'Remove' : 'Select'} ${interest}`}
                  onPress={() => toggleInterest(interest)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{interest}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {!selectedInterests.length && (
            <Text style={styles.preferenceHint}>
              No interests selected. We will use {t(`guide.${preferences.preferredGuideId}`)}'s recommended mix.
            </Text>
          )}

          <Text style={styles.sectionHeading}>Language</Text>
          <View style={styles.languageRow}>
            {(['en', 'ru'] as SupportedLocale[]).map((locale) => (
              <TouchableOpacity
                key={locale}
                style={[styles.languageButton, preferences.guideLanguage === locale && styles.languageButtonActive]}
                accessibilityLabel={`Select ${t(`language.${locale}`)}`}
                onPress={() => void selectLanguage(locale)}
              >
                <Text style={[styles.languageButtonText, preferences.guideLanguage === locale && styles.languageButtonTextActive]}>
                  {t(`language.${locale}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.routeSummaryCard}>
            <Text style={styles.routeSummaryTitle}>{tourB.title[preferences.guideLanguage]}</Text>
            <Text style={styles.routeSummaryMeta}>4 stops - 2.3 km - 52 min - {t(`guide.${preferences.preferredGuideId}`)}</Text>
          </View>
          <TouchableOpacity style={[styles.completionButton, styles.completionButtonPrimary]} onPress={startTour}>
            <Text style={styles.completionButtonPrimaryText}>Start Walk</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.modalPlainButton}
            onPress={() => {
              setTourPreferencesOpen(false);
              navigation.navigate('Settings' as never);
            }}
          >
            <Text style={styles.completionButtonText}>More Settings</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      <Modal visible={Boolean(guideProfileOpen)} animationType="slide">
        {guideProfileOpen && (
          <View style={styles.profileScreen}>
            <Image source={guideSelectionImages[guideProfileOpen]} style={styles.profileImage} resizeMode="cover" />
            <View pointerEvents="none" style={styles.profileLowerShade} />
            <View style={[styles.profileOverlay, { paddingTop: insets.top + spacing.md }]}>
              <TouchableOpacity style={styles.profileBackButton} onPress={() => setGuideProfileOpen(null)}>
                <Text style={styles.profileBackText}>‹</Text>
              </TouchableOpacity>
              <View style={styles.profileCopy}>
                <ScrollView style={styles.profileTextScroll} contentContainerStyle={styles.profileTextContent}>
                  <Text style={styles.profileName}>{t(`guide.${guideProfileOpen}`)}</Text>
                  <Text style={styles.profileRole}>{guideProfiles[guideProfileOpen].role}</Text>
                  <Text style={styles.profileBody}>
                    {guideProfiles[guideProfileOpen].description[preferences.guideLanguage]}
                  </Text>
                  <View style={styles.profileTagRow}>
                    {guideProfiles[guideProfileOpen].interests.map((interest) => (
                      <Text key={interest} style={styles.profileTag}>{interest}</Text>
                    ))}
                  </View>
                  <Text style={styles.profileQuote}>"{guideProfiles[guideProfileOpen].sample}"</Text>
                </ScrollView>
                <TouchableOpacity
                  style={[styles.completionButton, styles.completionButtonPrimary]}
                  onPress={() => {
                    void selectGuide(guideProfileOpen);
                    setGuideProfileOpen(null);
                  }}
                >
                  <Text style={styles.completionButtonPrimaryText}>Choose {t(`guide.${guideProfileOpen}`)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalPlainButton} onPress={() => setGuideProfileOpen(null)}>
                  <Text style={styles.profileSecondaryText}>Back to Guides</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>

      <Modal transparent visible={transcriptOpen} animationType="fade">
        <View style={styles.saveModalBackdrop}>
          <View style={styles.saveModalCard}>
            <Text style={styles.saveModalTitle}>Transcript</Text>
            <Text style={styles.transcriptBody}>
              {activeNarrative?.arrivalText ?? activeExploreNarrative?.arrivalText ?? 'Transcript will appear when a story starts.'}
            </Text>
            <TouchableOpacity style={[styles.completionButton, styles.completionButtonPrimary]} onPress={() => setTranscriptOpen(false)}>
              <Text style={styles.completionButtonPrimaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={sharePreviewOpen} animationType="slide">
        <ScrollView style={styles.modalScreen} contentContainerStyle={[styles.modalContent, { paddingTop: insets.top + spacing.lg }]}>
          <Text style={styles.modalTitle}>Downtown Manhattan Walk</Text>
          <Text style={styles.modalSubtitle}>No account required to start.</Text>
          {sharePreviewState === 'invalid_link' ? (
            <View style={styles.routeUnavailableCard}>
              <Text style={styles.routeSummaryTitle}>This tour link is no longer available.</Text>
              <Text style={styles.routeSummaryMeta}>Open Explore to start a nearby walk instead.</Text>
            </View>
          ) : sharePreviewState === 'unsupported_location' ? (
            <View style={styles.routeUnavailableCard}>
              <Text style={styles.routeSummaryTitle}>This shared tour is outside the supported area.</Text>
              <Text style={styles.routeSummaryMeta}>Hey City can still show the stop list while live guidance stays disabled.</Text>
            </View>
          ) : (
            <>
              <View style={styles.shareMapPreview}>
                <MapView style={StyleSheet.absoluteFillObject} initialRegion={tourRegion} region={tourRegion}>
                  <Polyline coordinates={tourB.fullRouteCoordinates} strokeColor={colors.primaryOrange} strokeWidth={5} />
                  {tourBTargets.map((target) => (
                    <Marker key={target.id} coordinate={target.coordinates} title={target.narratives[activeGuideId][activeGuideLanguage].title} />
                  ))}
                </MapView>
              </View>
              <View style={styles.routeSummaryCard}>
                <Text style={styles.routeSummaryTitle}>{t(`guide.${activeGuideId}`)} created a walk for you</Text>
                <Text style={styles.routeSummaryMeta}>4 stops - 2.3 km - 52 min</Text>
              </View>
              <View style={styles.completedList}>
                {tourBTargets.map((target) => (
                  <View key={target.id} style={styles.completedRow}>
                    <Text style={styles.completedCheck}>{target.sequence}</Text>
                    <Text style={styles.completedName}>{target.narratives[activeGuideId][activeGuideLanguage].title}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={[styles.completionButton, styles.completionButtonPrimary]} onPress={() => {
                setSharePreviewOpen(false);
                startTour();
              }}>
                <Text style={styles.completionButtonPrimaryText}>Start Tour</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.completionButton} onPress={() => setSharePreviewOpen(false)}>
            <Text style={styles.completionButtonText}>Preview Route</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalPlainButton} onPress={() => setSharePreviewOpen(false)}>
            <Text style={styles.completionButtonText}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      <Modal transparent visible={Boolean(routeSaveModal)} animationType="fade">
        <View style={styles.saveModalBackdrop}>
          <View style={styles.saveModalCard}>
            <Text style={styles.saveModalIcon}>{routeSaveModal === 'saved' ? '✓' : '▣'}</Text>
            <Text style={styles.saveModalTitle}>
              {routeSaveModal === 'saved' ? t('tour.routeSaved') : t('tour.saveRequiresAccount')}
            </Text>
            <TouchableOpacity
              style={[styles.completionButton, styles.completionButtonPrimary]}
              onPress={() => {
                if (routeSaveModal === 'saved') {
                  setRouteSaveModal(null);
                  return;
                }
                setRouteSaveModal(null);
                navigation.navigate('Login' as never);
              }}
            >
              <Text style={styles.completionButtonPrimaryText}>
                {routeSaveModal === 'saved' ? t('common.ready') : t('settings.signIn')}
              </Text>
            </TouchableOpacity>
            {routeSaveModal === 'guest' && (
              <>
                <TouchableOpacity style={styles.completionButton} onPress={() => navigation.navigate('Login' as never)}>
                  <Text style={styles.completionButtonText}>{t('settings.signInSignUp')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalPlainButton} onPress={() => setRouteSaveModal(null)}>
                  <Text style={styles.completionButtonText}>{t('tour.notNow')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  screenTitle: {
    ...typography.title,
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  modeChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    flexShrink: 1,
  },
  modeChipActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primaryOrange },
  modeChipText: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
  modeChipTextActive: { color: colors.primaryOrange },
  exploreStage: {
    overflow: 'hidden',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm,
  },
  exploreTopOverlay: {
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
  modeRowCompact: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(243,240,234,0.9)',
  },
  modeChipCompact: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  modeChipCompactActive: {
    borderWidth: 1,
    borderColor: colors.primaryOrange,
    backgroundColor: colors.surface,
  },
  modeChipCompactText: { color: colors.textMuted, fontSize: 16, lineHeight: 20, fontWeight: '700' },
  modeChipCompactTextActive: { color: colors.primaryOrange },
  exploreGuideCapsule: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    zIndex: 25,
    minHeight: 204,
    alignItems: 'stretch',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: colors.foreground,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 8,
  },
  capsuleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  capsuleGuideName: { ...typography.body, color: colors.foreground, fontWeight: '700' },
  capsuleBody: { ...typography.body, color: colors.foreground },
  routeMetaText: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  capsuleActions: { gap: spacing.sm, alignItems: 'stretch' },
  capsuleSecondaryButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  capsuleSecondaryText: { ...typography.caption, color: colors.foreground, textAlign: 'center' },
  contextSurface: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  contextTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.foreground,
  },
  cityExplorerCard: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cityExplorerGuide: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  cityExplorerText: { flex: 1 },
  passiveMapWrap: {
    height: 360,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  mapWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  mapInfoOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.48)',
    backgroundColor: 'rgba(255,253,248,0.56)',
    shadowColor: colors.foreground,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 9,
    zIndex: 30,
  },
  tourHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  guidedTopOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 24,
    alignItems: 'center',
    gap: spacing.sm,
  },
  guidedTopChip: {
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
  guidedStopChip: {
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
  guidedGuideAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
  },
  tourInfoText: { flex: 1 },
  currentObjectLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 2,
  },
  mapMetrics: { gap: 2 },
  controlsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  completionBox: { gap: spacing.sm, marginTop: spacing.sm },
  approachBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(244,240,232,0.62)',
  },
  controlButton: {
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,240,232,0.86)',
  },
  controlButtonPrimary: { backgroundColor: colors.primaryOrange },
  controlButtonText: {
    ...typography.caption,
    color: colors.foreground,
  },
  controlButtonTextPrimary: {
    color: colors.surface,
  },
  compactPauseButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,248,0.86)',
    shadowColor: colors.foreground,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 5,
  },
  compactPauseText: { ...typography.label, color: colors.foreground },
  completionScreen: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  completionReward: {
    alignSelf: 'center',
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryOrangeLight,
  },
  completionRewardIcon: {
    overflow: 'hidden',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryOrange,
    color: colors.surface,
    fontSize: 32,
    lineHeight: 56,
    textAlign: 'center',
    fontWeight: '700',
  },
  completionTitle: {
    ...typography.title,
    color: colors.foreground,
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
  },
  completionSubtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  completionMetricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  completionMetricCard: {
    flex: 1,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  completionMetricValue: { ...typography.body, color: colors.foreground, fontWeight: '700' },
  completionMetricLabel: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  completionGuideNote: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(244,240,232,0.7)',
  },
  completionGuideName: { ...typography.caption, color: colors.textMuted },
  completionGuideText: { ...typography.body, color: colors.foreground },
  completedList: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  completedCheck: { color: '#34C759', fontSize: 16, fontWeight: '700' },
  completedName: { ...typography.caption, color: colors.foreground, flex: 1 },
  completionButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  completionButtonPrimary: { backgroundColor: colors.primaryOrange },
  completionButtonText: { ...typography.caption, color: colors.foreground },
  completionButtonPrimaryText: { ...typography.caption, color: colors.surface },
  saveModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(28,28,30,0.38)',
  },
  saveModalCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    backgroundColor: 'rgba(255,253,248,0.9)',
  },
  saveModalIcon: { fontSize: 36, textAlign: 'center', color: colors.foreground },
  saveModalTitle: { ...typography.label, color: colors.foreground, textAlign: 'center' },
  modalPlainButton: { alignItems: 'center', paddingVertical: spacing.sm },
  settingsTrigger: { marginBottom: 12 },
  settingsTriggerText: { color: colors.foreground, fontSize: 14 },
  settingsBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 20,
  },
  settingsLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: { backgroundColor: colors.primaryOrange },
  chipText: { color: colors.textMuted, fontSize: 12 },
  chipTextActive: { color: colors.surface },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  panelWrap: { marginTop: spacing.md },
  playingLabel: { marginTop: 12, color: colors.textMuted, fontSize: 14 },
  motionLabel: { marginTop: 8, color: colors.textMuted, fontSize: 12 },
  errorText: { marginBottom: spacing.md, color: colors.danger, fontSize: 13 },
  warnText: { marginTop: 8, color: colors.warning, fontSize: 12 },
  previewButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryOrange,
  },
  previewButtonText: { ...typography.body, color: colors.surface, fontWeight: '700', textAlign: 'center' },
  secondaryRouteButton: {
    minHeight: 44,
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryRouteButtonText: { ...typography.caption, color: colors.foreground },
  modalScreen: { flex: 1, backgroundColor: colors.background },
  modalContent: { paddingHorizontal: spacing.lg, paddingBottom: 64, gap: spacing.md },
  modalTitle: { ...typography.title, color: colors.foreground, fontSize: 30, lineHeight: 36 },
  modalSubtitle: { ...typography.body, color: colors.textMuted },
  sectionHeading: { ...typography.label, color: colors.foreground },
  preferenceGuideRow: { flexDirection: 'row', gap: spacing.sm },
  preferenceGuideCard: {
    flex: 1,
    minHeight: 190,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    position: 'relative',
  },
  preferenceGuideCardSelected: {
    borderWidth: 2,
    borderColor: colors.primaryOrange,
    backgroundColor: colors.primaryOrangeLight,
  },
  preferenceGuideImage: { width: 76, height: 76, borderRadius: 38, marginBottom: spacing.sm },
  preferenceGuideName: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  preferenceGuideRole: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  preferenceCheck: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    overflow: 'hidden',
    width: 24,
    height: 24,
    borderRadius: 12,
    color: colors.surface,
    backgroundColor: colors.primaryOrange,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '700',
  },
  preferenceHint: { ...typography.caption, color: colors.warning },
  languageRow: { flexDirection: 'row', gap: spacing.sm },
  languageButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  languageButtonActive: {
    borderColor: colors.primaryOrange,
    backgroundColor: colors.primaryOrangeLight,
  },
  languageButtonText: { ...typography.body, color: colors.foreground },
  languageButtonTextActive: { color: colors.primaryOrange, fontWeight: '600' },
  routeSummaryCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  routeSummaryTitle: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  routeSummaryMeta: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  profileScreen: { flex: 1, backgroundColor: colors.foreground },
  profileImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  profileLowerShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '58%',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  profileOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  profileBackButton: {
    width: 52,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  profileBackText: { color: colors.foreground, fontSize: 34, lineHeight: 38, fontWeight: '600' },
  profileCopy: { gap: spacing.md },
  profileTextScroll: { maxHeight: '70%' },
  profileTextContent: { gap: spacing.md, paddingBottom: spacing.sm },
  profileName: { color: colors.surface, fontSize: 48, lineHeight: 54, fontWeight: '700' },
  profileRole: { color: colors.primaryOrange, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  profileBody: { ...typography.body, color: colors.surface },
  profileTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  profileTag: {
    overflow: 'hidden',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(198,146,45,0.76)',
    color: colors.surface,
  },
  profileQuote: { ...typography.body, color: colors.surface },
  profileSecondaryText: { ...typography.caption, color: colors.surface },
  transcriptBody: { ...typography.body, color: colors.foreground },
  shareMapPreview: {
    height: 360,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  routeUnavailableCard: {
    minHeight: 220,
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
