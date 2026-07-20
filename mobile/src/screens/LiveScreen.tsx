import React, { useState, useEffect, useMemo } from 'react';
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
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { LiveControls } from '../components/live/LiveControls';
import { LiveStatusPill } from '../components/live/LiveStatusPill';
import { StoryPanel } from '../components/live/StoryPanel';
import {
  createExploreHomeViewModel,
  openTranscriptOverlay,
  selectLiveForegroundPhase,
  type LiveOverlay,
} from '../presentation/liveForeground';
import { colors, radius, spacing, typography } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useAppTranslation } from '../localization';
import type { GuidePreference, SupportedLocale } from '../localization/preferences';
import { NarrativeOverlay } from '../components/explore/NarrativeOverlay';
import { ActiveStoryView } from '../components/explore/ActiveStoryView';
import { ExploreHomeView } from '../components/explore/ExploreHomeView';
import { GuidedNavigationView } from '../components/explore/GuidedNavigationView';
import { TourPreferencesSheet } from '../components/explore/TourPreferencesSheet';
import { TranscriptSheet } from '../components/explore/TranscriptSheet';
import { tourB, tourBTargets } from '../demo/tours';
import {
  createInitialGuidedTourState,
  defaultExplorationMode,
  explorationModes,
  startGuidedTour,
  tourBLocationEvents,
  type ExplorationMode,
} from '../demo/guidedTour';
import { useDriveDiscoverySession } from '../features/live/useDriveDiscoverySession';
import { useExploreNarrative } from '../features/live/useExploreNarrative';
import { createSnapshotLocation, useGuidedTourDemo } from '../features/live/useGuidedTourDemo';

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
  const [routeSaveModal, setRouteSaveModal] = useState<'guest' | 'saved' | null>(null);
  const [liveOverlay, setLiveOverlay] = useState<LiveOverlay>(null);
  const [guideProfileOpen, setGuideProfileOpen] = useState<GuidePreference | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(['Hidden Gems', 'Local Life']);
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
  const [sharePreviewState, setSharePreviewState] = useState<SharePreviewState>('ready');
  const drive = useDriveDiscoverySession({
    identity,
    guideId: preferences.preferredGuideId,
    guideLanguage: preferences.guideLanguage,
  });
  const guided = useGuidedTourDemo({
    mode,
    preferredGuideId: preferences.preferredGuideId,
    guideLanguage: preferences.guideLanguage,
  });
  const exploreNarrative = useExploreNarrative({
    mode,
    guideId: preferences.preferredGuideId,
    guideLanguage: preferences.guideLanguage,
  });
  const {
    driveDiscoveryOn,
    sessionId,
    sessionError,
    settingsOpen,
    setSettingsOpen,
    themes,
    style,
    setStyle,
    lengthSec,
    leadTimeMin,
    autoplay,
    setAutoplay,
    muted,
    setMuted,
    lastResult,
    lastMotion,
    presentation,
    startSession,
    stopSession,
    toggleTheme,
    finishStory,
    pausePlayback,
    resumePlayback,
  } = drive;
  const {
    tourState,
    activeGuideId,
    activeGuideLanguage,
    currentTarget,
    narrativeTarget,
    activeNarrative,
    currentTargetTitle,
    approachText,
    completedRouteCoordinates,
    upcomingRouteCoordinates,
    guidedTargetMarkers,
    narrativeRemainingMs,
    startTour: startGuidedTourDemo,
    stopTour,
    continueTour,
    pauseTour,
    resumeTour,
    applySnapshotState,
  } = guided;
  const visibleExplorationModes = explorationModes.filter((item) => item !== 'drive_discovery');
  const passiveMapUserCoordinate = exploreNarrative.target?.coordinates ?? tourState.location ?? tourB.startCoordinate;
  const guidedMapHeight = Math.max(520, windowHeight - insets.top - insets.bottom - 250);
  const tourRegion: Region = useMemo(
    () => ({
      latitude: 40.7097,
      longitude: -74.0148,
      latitudeDelta: 0.009,
      longitudeDelta: 0.009,
    }),
    []
  );
  const foregroundPhase = selectLiveForegroundPhase({
    mode,
    journeyState: tourState.journeyState,
    narrativeState: tourState.narrativeState,
    isPaused: tourState.isPaused,
    driveSessionActive: Boolean(sessionId),
    driveDiscoveryOn,
    overlayKind: liveOverlay?.kind ?? null,
  });
  const exploreHomeViewModel = createExploreHomeViewModel({
    areaName: 'Financial District - Nearby',
    guideId: preferences.preferredGuideId,
    guideName: t(`guide.${preferences.preferredGuideId}`),
    guideLanguage: preferences.guideLanguage,
    ambientCopy: t(`live.walkNaturally.${preferences.preferredGuideId}`),
  });
  const openTourPreferences = () => setLiveOverlay({ kind: 'tour_preferences' });
  const openTranscript = () => setLiveOverlay(openTranscriptOverlay(foregroundPhase));
  const closeForegroundOverlay = () => setLiveOverlay(null);

  const startTour = () => {
    setMode('guided_tour');
    setLiveOverlay(null);
    startGuidedTourDemo();
  };

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

  useEffect(() => {
    if (!__DEV__) return;

    const applyTask002SnapshotPhase = (url?: string | null) => {
      const phase = url?.match(/[?&]task002Phase=([^&]+)/)?.[1];
      if (!phase) return;

      const decodedPhase = decodeURIComponent(phase);
      const baseState = createInitialGuidedTourState(preferences.preferredGuideId, preferences.guideLanguage);
      const firstTarget = tourBTargets[0];
      const snapshotLocation = createSnapshotLocation(firstTarget);

      setLiveOverlay(null);
      setGuideProfileOpen(null);
      setSharePreviewOpen(false);
      setRouteSaveModal(null);
      exploreNarrative.reset();

      if (decodedPhase === 'explore') {
        setMode('city_explorer');
        applySnapshotState(baseState, null);
        return;
      }

      if (decodedPhase === 'preferences') {
        setMode('city_explorer');
        applySnapshotState(baseState, null);
        setLiveOverlay({ kind: 'tour_preferences' });
        return;
      }

      if (decodedPhase === 'russian_dense') {
        void updatePreferences({ guideLanguage: 'ru', preferredGuideId: 'arthur' });
        setSelectedInterests(['History', 'Architecture', 'Context']);
        setMode('city_explorer');
        applySnapshotState(createInitialGuidedTourState('arthur', 'ru'), null);
        setLiveOverlay({ kind: 'tour_preferences' });
        return;
      }

      if (decodedPhase === 'drive_idle') {
        setMode('drive_discovery');
        applySnapshotState(baseState, null);
        return;
      }

      setMode('guided_tour');

      if (decodedPhase === 'navigating') {
        applySnapshotState(
          {
            ...startGuidedTour(baseState),
            location: {
              ...tourB.startCoordinate,
              heading: 24,
              speedKmh: 4.2,
              timestampMs: Date.now(),
            },
            distanceToCurrentTargetMeters: 440,
          },
          null,
          tourBLocationEvents.length
        );
        return;
      }

      if (decodedPhase === 'active_story' || decodedPhase === 'story_paused' || decodedPhase === 'transcript' || decodedPhase === 'restored') {
        applySnapshotState(
          {
            ...baseState,
            journeyState: decodedPhase === 'story_paused' ? 'paused' : 'narrating',
            narrativeState: 'arrival',
            currentTargetId: firstTarget.id,
            arrivedTargetIds: [firstTarget.id],
            location: snapshotLocation,
            distanceToCurrentTargetMeters: 0,
            isPaused: decodedPhase === 'story_paused',
          },
          decodedPhase === 'story_paused' ? 7000 : 5000
        );
        if (decodedPhase === 'transcript') {
          setLiveOverlay({ kind: 'transcript', returnPhase: 'guided_story_active' });
        }
        return;
      }

      if (decodedPhase === 'story_complete') {
        applySnapshotState(
          {
            ...baseState,
            journeyState: 'waiting_to_continue',
            narrativeState: 'completed',
            currentTargetId: firstTarget.id,
            arrivedTargetIds: [firstTarget.id],
            narratedTargetIds: [firstTarget.id],
            location: snapshotLocation,
            distanceToCurrentTargetMeters: 0,
            autoContinueRemainingMs: tourB.continueDelaySec * 1000,
          },
          null
        );
      }
    };

    void Linking.getInitialURL().then(applyTask002SnapshotPhase);
    const subscription = Linking.addEventListener('url', ({ url }) => applyTask002SnapshotPhase(url));
    return () => subscription.remove();
  }, [preferences.preferredGuideId, preferences.guideLanguage, updatePreferences]);

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
      {mode === 'city_explorer' && (
        <ExploreHomeView
          height={Math.max(640, windowHeight - tabBarHeight - insets.top - 8)}
          region={tourRegion}
          userCoordinate={passiveMapUserCoordinate}
          markers={
            __DEV__
              ? tourBTargets.map((target) => ({
                  id: target.id,
                  coordinate: target.coordinates,
                  title: target.narratives[preferences.preferredGuideId][preferences.guideLanguage].title,
                  pinColor: exploreNarrative.activeTargetId === target.id ? colors.warning : '#8E8E93',
                  onPress: () => exploreNarrative.trigger(target.id),
                }))
              : []
          }
          modes={visibleExplorationModes}
          activeMode={mode}
          onSelectMode={setMode}
          guideImage={guideImages[preferences.preferredGuideId]}
          viewModel={exploreHomeViewModel}
          onChooseGuidedWalk={openTourPreferences}
        >
          {exploreNarrative.narrative && exploreNarrative.target && (
            <NarrativeOverlay
              title={exploreNarrative.narrative.title}
              guideName={t(`guide.${preferences.preferredGuideId}`)}
              text={exploreNarrative.narrative.arrivalText}
              playbackState={exploreNarrative.isPaused ? 'paused' : 'playing'}
              progress={1}
              onPause={exploreNarrative.pause}
              onResume={exploreNarrative.resume}
              onContinue={exploreNarrative.close}
              onTranscript={openTranscript}
            />
          )}
        </ExploreHomeView>
      )}

      {foregroundPhase === 'guided_tour_complete' && (
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

      {(foregroundPhase === 'guided_navigating' || foregroundPhase === 'guided_approaching') && (
        <GuidedNavigationView
          height={guidedMapHeight}
          region={tourRegion}
          completedRouteCoordinates={completedRouteCoordinates}
          upcomingRouteCoordinates={upcomingRouteCoordinates}
          targets={guidedTargetMarkers}
          userCoordinate={tourState.location}
          currentTargetTitle={currentTargetTitle}
          currentTargetSequence={currentTarget?.sequence ?? 1}
          totalTargets={tourBTargets.length}
          guideImage={guideImages[activeGuideId]}
          guideName={t(`guide.${activeGuideId}`)}
          journeyStateLabel={t(`journey.${tourState.journeyState}`)}
          distanceMeters={tourState.distanceToCurrentTargetMeters}
          approachText={approachText}
          isPaused={tourState.isPaused}
          onTogglePause={tourState.isPaused ? resumeTour : pauseTour}
          onTranscript={openTranscript}
          onEndTour={confirmStopTour}
        />
      )}

      {(foregroundPhase === 'guided_story_active' ||
        foregroundPhase === 'guided_story_paused' ||
        foregroundPhase === 'guided_story_complete') &&
        activeNarrative &&
        narrativeTarget && (
          <ActiveStoryView
            height={guidedMapHeight}
            region={tourRegion}
            completedRouteCoordinates={completedRouteCoordinates}
            upcomingRouteCoordinates={upcomingRouteCoordinates}
            targets={guidedTargetMarkers}
            userCoordinate={tourState.location}
            title={activeNarrative.title}
            guideName={t(`guide.${activeGuideId}`)}
            text={activeNarrative.arrivalText}
            playbackState={
              foregroundPhase === 'guided_story_complete'
                ? 'completed'
                : foregroundPhase === 'guided_story_paused'
                  ? 'paused'
                  : 'playing'
            }
            progress={
              narrativeRemainingMs === null
                ? 1
                : 1 - narrativeRemainingMs / Math.max(1, activeNarrative.estimatedDurationSec * 1000)
            }
            autoContinueRemainingMs={tourState.autoContinueRemainingMs}
            onPause={pauseTour}
            onResume={resumeTour}
            onContinue={continueTour}
            onTranscript={openTranscript}
          />
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

      <TourPreferencesSheet
        visible={liveOverlay?.kind === 'tour_preferences'}
        topInset={insets.top}
        guideIds={['dana', 'arthur']}
        selectedGuideId={preferences.preferredGuideId}
        selectedLanguage={preferences.guideLanguage}
        selectedInterests={selectedInterests}
        interestOptions={interestOptions}
        guideImages={guideImages}
        guideProfiles={guideProfiles}
        tourTitle={tourB.title[preferences.guideLanguage]}
        routeMeta={`4 stops - 2.3 km - 52 min - ${t(`guide.${preferences.preferredGuideId}`)}`}
        getGuideName={(guideId) => t(`guide.${guideId}`)}
        getLanguageName={(locale) => t(`language.${locale}`)}
        onSelectGuide={(guideId) => void selectGuide(guideId)}
        onOpenGuideProfile={setGuideProfileOpen}
        onToggleInterest={toggleInterest}
        onSelectLanguage={(locale) => void selectLanguage(locale)}
        onStartWalk={startTour}
        onMoreSettings={() => {
          closeForegroundOverlay();
          navigation.navigate('Settings' as never);
        }}
      />

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

      <TranscriptSheet
        visible={liveOverlay?.kind === 'transcript'}
        topInset={insets.top}
        title={activeNarrative?.title ?? exploreNarrative.narrative?.title ?? 'Story'}
        body={activeNarrative?.arrivalText ?? exploreNarrative.narrative?.arrivalText ?? 'Transcript will appear when a story starts.'}
        onClose={closeForegroundOverlay}
      />

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
