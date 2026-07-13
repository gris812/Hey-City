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
import { sendOtp, verifyOtp } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSendOtp = async () => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setLoading(true);
    try {
      await sendOtp(e);
      setStep('code');
    } catch (err) {
      Alert.alert('Ошибка', (err as Error).message);
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
    } catch (err) {
      Alert.alert('Ошибка', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.box}>
        <Text style={styles.title}>Sunshine AI Guide</Text>
        <Text style={styles.subtitle}>Войдите по email</Text>

        {step === 'email' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#888"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Отправить код</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.hint}>Код отправлен на {email}</Text>
            <TextInput
              style={styles.input}
              placeholder="Код из письма"
              placeholderTextColor="#888"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Войти</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.link} onPress={() => setStep('email')}>
              <Text style={styles.linkText}>Изменить email</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#eee',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  hint: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#e94560',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#e94560',
    fontSize: 14,
  },
});
