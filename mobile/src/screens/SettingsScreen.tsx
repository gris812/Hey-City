import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { getProfile, updateProfile, updatePrivacy, deleteAllHistory } from '../api/me';
import { useAuth } from '../context/AuthContext';

export function SettingsScreen() {
  const { logout } = useAuth();
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getProfile().then((p) => setHistoryEnabled(p.historyEnabled));
  }, []);

  const handleHistoryToggle = async (value: boolean) => {
    setLoading(true);
    try {
      await updatePrivacy(value);
      setHistoryEnabled(value);
    } catch (e) {
      Alert.alert('Ошибка', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistory = () => {
    Alert.alert(
      'Удалить историю',
      'Вся история поездок и POI будет удалена. Продолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await deleteAllHistory();
              Alert.alert('Готово', 'История удалена');
            } catch (e) {
              Alert.alert('Ошибка', (e as Error).message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Настройки</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Приватность</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Сохранять историю</Text>
          <Switch
            value={historyEnabled}
            onValueChange={handleHistoryToggle}
            disabled={loading}
          />
        </View>
        <Text style={styles.hint}>По умолчанию история включена. Отключите, чтобы не сохранять поездки и POI.</Text>
        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleDeleteHistory}
          disabled={loading}
        >
          <Text style={styles.dangerButtonText}>Удалить всю историю</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={() => logout()}>
          <Text style={styles.logoutButtonText}>Выйти</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#eee', marginBottom: 24 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#ccc', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { color: '#eee', fontSize: 16 },
  hint: { color: '#666', fontSize: 12, marginBottom: 12 },
  dangerButton: { paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e94560', borderRadius: 12 },
  dangerButtonText: { color: '#e94560', fontSize: 14 },
  logoutButton: { backgroundColor: '#16213e', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  logoutButtonText: { color: '#e94560', fontSize: 16 },
});
