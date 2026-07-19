import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
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
import { getProfile, updatePrivacy } from '../api/me';
import { useAuth } from '../context/AuthContext';
import {
  guestProfileDefaults,
  shouldLoadProfile,
} from '../context/appIdentity';
import {
  supportedLocales,
  type GuidePreference,
  type SupportedLocale,
  useAppTranslation,
} from '../localization';
import { colors, radius, spacing, typography } from '../theme';
import { LocationSimulationPanel } from '../dev/locationSimulation';

const guideOptions: Array<{ id: GuidePreference }> = [
  { id: 'dana' },
  { id: 'arthur' },
];

const guideImages = {
  dana: require('../../assets/Guides/DanaSelection.png'),
  arthur: require('../../assets/Guides/ArturSelection.png'),
} as const;

export function SettingsScreen() {
  const { identity, logout, preferences, updatePreferences } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const [historyEnabled, setHistoryEnabled] = useState(guestProfileDefaults.historyEnabled);
  const [loading, setLoading] = useState(false);
  const [guideTip, setGuideTip] = useState<GuidePreference | null>(null);

  useEffect(() => {
    if (!shouldLoadProfile(identity)) return;
    getProfile().then((p) => setHistoryEnabled(p.historyEnabled));
  }, [identity]);

  const selectGuide = async (guide: GuidePreference) => {
    await updatePreferences({ preferredGuideId: guide });
    setGuideTip(guide);
  };

  const handleHistoryToggle = async (value: boolean) => {
    if (!shouldLoadProfile(identity)) {
      Alert.alert(t('common.account'), t('live.accountRequired'));
      return;
    }
    setLoading(true);
    try {
      await updatePrivacy(value);
      setHistoryEnabled(value);
    } catch (e) {
      Alert.alert(t('common.error'), (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const selectedTip = guideTip
    ? {
        name: t(`guide.${guideTip}`),
        description: t(`guide.${guideTip}Description`),
      }
    : null;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 120 },
        ]}
      >
        <Text style={styles.title}>{t('settings.title')}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {identity.status === 'authenticated' ? (
            <TouchableOpacity style={styles.accountButton} onPress={() => logout()}>
              <Text style={styles.accountButtonText}>{t('settings.signOut')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.accountButton} onPress={() => navigation.navigate('Login' as never)}>
              <Text style={styles.accountButtonText}>{t('settings.signInSignUp')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Guide & Interests</Text>
          <View style={styles.avatarRow}>
            {guideOptions.map((guide) => {
              const active = preferences.preferredGuideId === guide.id;
              return (
                <TouchableOpacity
                  key={guide.id}
                  style={[
                    styles.avatarOption,
                    guide.id === 'arthur' && styles.avatarOptionArthur,
                    active && styles.avatarOptionActive,
                  ]}
                  onPress={() => void selectGuide(guide.id)}
                  accessibilityLabel={`Select ${t(`guide.${guide.id}`)}`}
                  activeOpacity={0.85}
                >
                  <Image source={guideImages[guide.id]} style={styles.avatarImage} />
                  <View style={styles.avatarNameOverlay}>
                    <Text style={styles.avatarName}>{t(`guide.${guide.id}`)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Language</Text>
          <Text style={styles.hint}>{t('onboarding.appLanguage')}</Text>
          <View style={styles.chipRow}>
            {supportedLocales.map((locale) => (
              <TouchableOpacity
                key={locale}
                style={[styles.chip, preferences.appLanguage === locale && styles.chipActive]}
                onPress={() => void updatePreferences({ appLanguage: locale as SupportedLocale })}
                accessibilityLabel={`Select app language ${t(`language.${locale}`)}`}
              >
                <Text style={styles.chipText}>{t(`language.${locale}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.hint}>{t('onboarding.guideLanguage')}</Text>
          <View style={styles.chipRow}>
            {supportedLocales.map((locale) => (
              <TouchableOpacity
                key={locale}
                style={[styles.chip, preferences.guideLanguage === locale && styles.chipActive]}
                onPress={() => void updatePreferences({ guideLanguage: locale as SupportedLocale })}
                accessibilityLabel={`Select guide language ${t(`language.${locale}`)}`}
              >
                <Text style={styles.chipText}>{t(`language.${locale}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audio & Text</Text>
          <Text style={styles.hint}>Voice, speed and text size controls will use the active guide language.</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Autoplay stories</Text>
            <Switch value disabled />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Launch</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.onboardingAtLaunch')}</Text>
            <Switch
              value={preferences.showOnboardingAtLaunch}
              onValueChange={(showOnboardingAtLaunch) =>
                void updatePreferences({ showOnboardingAtLaunch })
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>History & Privacy</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.saveHistory')}</Text>
            <Switch value={historyEnabled} onValueChange={handleHistoryToggle} disabled={loading} />
          </View>
          <Text style={styles.hint}>{t('settings.historyHint')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Hey City</Text>
          <Text style={styles.hint}>Version 1.0.0 - City Signal v1 UI refresh</Text>
        </View>

        {__DEV__ && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.developerTools')}</Text>
            <LocationSimulationPanel />
          </View>
        )}
      </ScrollView>

      <Modal transparent visible={Boolean(selectedTip)} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setGuideTip(null)}>
          <View style={styles.glassPanel}>
            <Text style={styles.glassEyebrow}>{t('guide.tipTitle')}</Text>
            <Text style={styles.glassTitle}>{selectedTip?.name}</Text>
            <Text style={styles.glassBody}>{selectedTip?.description}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  title: { ...typography.title, color: colors.foreground, fontSize: 30, lineHeight: 36 },
  section: {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  sectionTitle: { ...typography.label, color: colors.foreground },
  avatarRow: { flexDirection: 'row', gap: spacing.sm },
  avatarOption: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 0,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    minHeight: 168,
    overflow: 'hidden',
    borderBottomWidth: 4,
    borderBottomColor: colors.dana,
  },
  avatarOptionActive: { borderWidth: 2, borderColor: colors.foreground, backgroundColor: colors.surface },
  avatarOptionArthur: { borderBottomColor: colors.arthur },
  avatarImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  avatarNameOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(28,28,30,0.12)',
  },
  avatarName: { color: colors.surface, fontSize: 30, lineHeight: 34, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: { backgroundColor: colors.dana },
  chipText: { ...typography.caption, color: colors.foreground },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.body, color: colors.foreground },
  hint: { ...typography.caption, color: colors.textMuted },
  dangerButton: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.pill,
  },
  dangerButtonText: { ...typography.caption, color: colors.danger },
  accountButton: {
    backgroundColor: colors.foreground,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  accountButtonText: { ...typography.label, color: colors.surface },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(28, 28, 30, 0.24)',
  },
  glassPanel: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,253,248,0.86)',
    shadowColor: colors.foreground,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 32,
    elevation: 10,
  },
  glassEyebrow: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  glassTitle: { ...typography.title, color: colors.foreground, marginBottom: spacing.sm },
  glassBody: { ...typography.body, color: colors.foreground },
});
