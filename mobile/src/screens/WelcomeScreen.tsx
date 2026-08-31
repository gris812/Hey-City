import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, type Region } from 'react-native-maps';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { useAppTranslation } from '../localization';
import { colors, radius, shadows, spacing, typography } from '../theme';

const WELCOME_REGION: Region = {
  latitude: 40.7163,
  longitude: -74.006,
  latitudeDelta: 0.035,
  longitudeDelta: 0.035,
};

export function WelcomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { preferences } = useAuth();
  const { t } = useAppTranslation();

  const continueFlow = () => {
    if (preferences.onboardingCompleted) {
      navigation.reset({ index: 0, routes: [{ name: 'Main' as never }] });
      return;
    }
    navigation.navigate('Onboarding' as never);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <MapView
        pointerEvents="none"
        style={StyleSheet.absoluteFillObject}
        initialRegion={WELCOME_REGION}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        pitchEnabled={false}
        rotateEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        toolbarEnabled={false}
      >
        <Marker coordinate={{ latitude: 40.7127, longitude: -74.0134 }}>
          <View style={styles.mapMarkerOuter}>
            <View style={styles.mapMarkerInner} />
          </View>
        </Marker>
      </MapView>

      <View style={styles.mapWash} pointerEvents="none" />

      <View style={[styles.brandBadge, { top: insets.top + spacing.md }]}>
        <View style={styles.brandMark}>
          <View style={styles.brandMarkDot} />
        </View>
        <Text style={styles.brandName}>Hey City</Text>
      </View>

      <View style={[styles.heroPin, { top: insets.top + 118 }]} pointerEvents="none">
        <View style={styles.heroPinPulse} />
        <View style={styles.heroPinCore} />
      </View>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        <Text style={styles.eyebrow}>{t('welcome.eyebrow')}</Text>
        <Text style={styles.title}>{t('welcome.title')}</Text>
        <Text style={styles.subtitle}>{t('welcome.subtitle')}</Text>

        <View style={styles.featureRow}>
          <FeatureItem icon="◎" label={t('welcome.featureNearby')} />
          <FeatureItem icon="◖" label={t('welcome.featureAdaptive')} />
          <FeatureItem icon="◉" label={t('welcome.featureVoice')} />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          style={styles.primaryButton}
          activeOpacity={0.86}
          onPress={continueFlow}
        >
          <Text style={styles.primaryText}>{t('welcome.start')}</Text>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Login' as never)}
        >
          <Text style={styles.secondaryText}>{t('welcome.signIn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FeatureItem({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Text style={styles.featureGlyph}>{icon}</Text>
      </View>
      <Text style={styles.featureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(236,247,238,0.28)',
  },
  brandBadge: {
    position: 'absolute',
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...shadows.subtle,
  },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  brandName: {
    color: colors.foreground,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  heroPin: {
    position: 'absolute',
    alignSelf: 'center',
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPinPulse: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(15,122,63,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(15,122,63,0.25)',
  },
  heroPinCore: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    borderWidth: 8,
    borderColor: colors.surface,
    ...shadows.floating,
  },
  mapMarkerOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15,122,63,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapMarkerInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  sheet: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.97)',
    paddingTop: 12,
    paddingHorizontal: spacing.lg,
    ...shadows.floating,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  eyebrow: {
    ...typography.label,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.foreground,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -1,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 12,
  },
  featureRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  featureItem: {
    flex: 1,
    gap: spacing.sm,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureGlyph: {
    color: colors.primary,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  featureLabel: {
    ...typography.caption,
    color: colors.foreground,
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryText: {
    color: colors.surface,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  arrow: {
    color: colors.surface,
    fontSize: 23,
    lineHeight: 25,
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    ...typography.label,
    color: colors.primary,
  },
});
