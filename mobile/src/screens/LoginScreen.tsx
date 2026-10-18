import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { sendOtp, verifyOtp, type OtpDeliveryMode } from '../api/auth';
import { otpCodeEntry, authErrorTranslationKey } from '../features/auth/otpFlow';
import { useAuth } from '../context/AuthContext';
import { useAppTranslation } from '../localization';
import { colors, radius, spacing, typography } from '../theme';

function localizeAuthError(
  message: string,
  delivery: OtpDeliveryMode | null,
  t: ReturnType<typeof useAppTranslation>['t'],
): string {
  const key = authErrorTranslationKey(message, delivery);
  return key ? t(key) : message;
}

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [delivery, setDelivery] = useState<OtpDeliveryMode | null>(null);
  const codeEntry = otpCodeEntry(delivery);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const { login, preferences } = useAuth();
  const { t } = useAppTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const handleSendOtp = async (showConfirmation = false) => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setLoading(true);
    try {
      const result = await sendOtp(e);
      setStep('code');
      setDelivery(result.delivery);
      setCode('');
      if (result.delivery === 'development_console') {
        Alert.alert('Hey City', t('auth.devConsoleCode'));
      } else if (showConfirmation && result.delivery === 'email') {
        Alert.alert('Hey City', t('auth.resendDone'));
      }
    } catch (err) {
      Alert.alert(t('common.error'), localizeAuthError((err as Error).message, delivery, t));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !code.trim()) return;
    setLoading(true);
    try {
      const { token } = await verifyOtp(e, code.trim());
      await login(token);
      navigation.navigate('Main' as never);
    } catch (err) {
      Alert.alert(t('common.error'), localizeAuthError((err as Error).message, delivery, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.box}>
        <Text style={styles.brand}>Hey City</Text>
        <Text style={styles.title}>{t('auth.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.explanation')}</Text>

        {step === 'email' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={() => void handleSendOtp()}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={() => void handleSendOtp()}
              disabled={loading || !email.trim()}
            >
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>{t('auth.sendCode')}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.emailHint}>{email.trim().toLowerCase()}</Text>
            <Text style={styles.codeHint}>{t(delivery === 'admin_code' ? 'auth.adminCode' : 'auth.codeHint')}</Text>
            <TextInput
              style={styles.input}
              placeholder={delivery === 'admin_code' ? t('auth.adminPlaceholder') : '123456'}
              placeholderTextColor={colors.textMuted}
              value={code}
              onChangeText={setCode}
              keyboardType={codeEntry.keyboardType}
              textContentType={delivery === 'admin_code' ? 'none' : 'oneTimeCode'}
              autoComplete={delivery === 'admin_code' ? 'off' : 'one-time-code'}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={delivery === 'admin_code'}
              maxLength={codeEntry.maxLength}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={loading || !codeEntry.canVerify(code)}
            >
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>{t('auth.verify')}</Text>}
            </TouchableOpacity>
            <View style={styles.secondaryRow}>
              {codeEntry.canResend && (
                <TouchableOpacity style={styles.secondaryAction} onPress={() => void handleSendOtp(true)} disabled={loading}>
                  <Text style={styles.linkText}>{t('auth.resend')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.secondaryAction} onPress={() => { setStep('email'); setCode(''); setDelivery(null); }} disabled={loading}>
                <Text style={styles.linkText}>{t('auth.changeEmail')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <TouchableOpacity
          style={styles.guestAction}
          onPress={() => navigation.navigate((preferences.onboardingCompleted ? 'Main' : 'Onboarding') as never)}
        >
          <Text style={styles.linkText}>{t('onboarding.exploreAsGuest')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  box: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  brand: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.foreground,
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 34,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  emailHint: {
    ...typography.body,
    color: colors.foreground,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  codeHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 52,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  button: {
    minHeight: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { ...typography.body, color: colors.surface, fontWeight: '700' },
  secondaryRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
  },
  secondaryAction: { minHeight: 44, justifyContent: 'center' },
  guestAction: { minHeight: 44, marginTop: spacing.md, alignItems: 'center', justifyContent: 'center' },
  linkText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
});
