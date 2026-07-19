import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme';
import { useAuth } from '../context/AuthContext';
import { requestForegroundLocationPermission } from '../location';
import {
  supportedLocales,
  type GuidePreference,
  type SupportedLocale,
} from '../localization';
import { useAppTranslation } from '../localization';

const guideOptions: GuidePreference[] = ['dana', 'arthur'];

const guideImages = {
  dana: require('../../assets/Guides/DanaSelection.png'),
  arthur: require('../../assets/Guides/ArturSelection.png'),
} as const;

export function OnboardingScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { preferences, updatePreferences, completeOnboarding } = useAuth();
  const { t } = useAppTranslation();
  const [permissionState, setPermissionState] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [loading, setLoading] = useState(false);

  const setAppLanguage = async (appLanguage: SupportedLocale) => {
    await updatePreferences({ appLanguage });
  };

  const setGuideLanguage = async (guideLanguage: SupportedLocale) => {
    await updatePreferences({ guideLanguage });
  };

  const setPreferredGuide = async (preferredGuideId: GuidePreference) => {
    await updatePreferences({ preferredGuideId });
  };

  const exploreAsGuest = async () => {
    setLoading(true);
    try {
      const permission = await requestForegroundLocationPermission();
      setPermissionState(permission === 'granted' ? 'granted' : 'denied');
      await completeOnboarding();
      navigation.navigate('Main' as never);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 48 },
      ]}
    >
      <Text style={styles.title}>{t('onboarding.title')}</Text>
      <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('onboarding.guideSection')}</Text>
        <View style={styles.guideRow}>
          {guideOptions.map((guide) => {
            const selected = preferences.preferredGuideId === guide;
            return (
              <TouchableOpacity
                key={guide}
                style={[
                  styles.guideCard,
                  selected && styles.guideCardSelected,
                  guide === 'arthur' && styles.arthurCard,
                ]}
                onPress={() => void setPreferredGuide(guide)}
              >
                <Image source={guideImages[guide]} style={styles.guideImage} />
                <View style={styles.guideNameOverlay}>
                  <Text style={styles.guideName}>{t(`guide.${guide}`)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('onboarding.appLanguage')}</Text>
        <View style={styles.chipRow}>
          {supportedLocales.map((locale) => (
            <TouchableOpacity
              key={locale}
              style={[styles.chip, preferences.appLanguage === locale && styles.chipActive]}
              onPress={() => void setAppLanguage(locale)}
            >
              <Text style={styles.chipText}>{t(`language.${locale}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('onboarding.guideLanguage')}</Text>
        <View style={styles.chipRow}>
          {supportedLocales.map((locale) => (
            <TouchableOpacity
              key={locale}
              style={[styles.chip, preferences.guideLanguage === locale && styles.chipActive]}
              onPress={() => void setGuideLanguage(locale)}
            >
              <Text style={styles.chipText}>{t(`language.${locale}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.locationBox}>
        <Text style={styles.sectionTitle}>{t('onboarding.locationTitle')}</Text>
        <Text style={styles.body}>{t('onboarding.locationExplanation')}</Text>
        {permissionState === 'denied' && (
          <Text style={styles.warning}>{t('onboarding.locationDenied')}</Text>
        )}
        {permissionState === 'granted' && (
          <Text style={styles.ready}>{t('onboarding.locationGranted')}</Text>
        )}
      </View>

      <View style={styles.inlineRow}>
        <Text style={styles.body}>{t('settings.onboardingAtLaunch')}</Text>
        <Switch
          value={preferences.showOnboardingAtLaunch}
          onValueChange={(showOnboardingAtLaunch) =>
            void updatePreferences({ showOnboardingAtLaunch })
          }
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.disabledButton]}
        onPress={exploreAsGuest}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.primaryText}>{t('onboarding.exploreAsGuest')}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Login' as never)}>
        <Text style={styles.secondaryText}>{t('settings.signInSignUp')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 48,
    gap: spacing.lg,
  },
  title: { ...typography.title, color: colors.foreground, fontSize: 30, lineHeight: 36 },
  subtitle: { ...typography.body, color: colors.textMuted },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.foreground },
  guideRow: { flexDirection: 'row', gap: spacing.sm },
  guideCard: {
    flex: 1,
    minHeight: 224,
    borderRadius: radius.md,
    borderWidth: 0,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderBottomWidth: 4,
    borderBottomColor: colors.dana,
    alignItems: 'center',
    overflow: 'hidden',
  },
  arthurCard: { borderBottomColor: colors.arthur },
  guideCardSelected: { borderColor: colors.foreground },
  guideImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  guideNameOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(28,28,30,0.12)',
  },
  guideName: { color: colors.surface, fontSize: 34, lineHeight: 38, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: { backgroundColor: colors.dana },
  chipText: { ...typography.caption, color: colors.foreground },
  locationBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  body: { ...typography.body, color: colors.foreground },
  inlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  warning: { ...typography.caption, color: colors.warning },
  ready: { ...typography.caption, color: colors.foreground },
  primaryButton: {
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.foreground,
    alignItems: 'center',
  },
  disabledButton: { opacity: 0.7 },
  primaryText: { ...typography.label, color: colors.surface },
  secondaryButton: { alignItems: 'center', paddingVertical: spacing.sm },
  secondaryText: { ...typography.label, color: colors.foreground },
});
