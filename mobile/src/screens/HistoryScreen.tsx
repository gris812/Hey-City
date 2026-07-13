import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { getProfile, HistoryItem } from '../api/me';

export function HistoryScreen() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [historyEnabled, setHistoryEnabled] = useState(true);

  useEffect(() => {
    getProfile().then((p) => {
      setHistoryEnabled(p.historyEnabled);
      setItems(p.history ?? []);
    });
  }, []);

  if (!historyEnabled) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>История</Text>
        <Text style={styles.disabled}>История отключена в настройках</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <View style={styles.item}>
      <Text style={styles.itemType}>{item.type}</Text>
      {item.placeId && <Text style={styles.itemPlace}>{item.placeId}</Text>}
      <Text style={styles.itemTime}>{new Date(item.timestamp).toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>История</Text>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>Пока пусто</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#eee', marginBottom: 16 },
  disabled: { color: '#666', fontSize: 14 },
  empty: { color: '#666', fontSize: 14, marginTop: 20 },
  item: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  itemType: { color: '#e94560', fontSize: 12, marginBottom: 4 },
  itemPlace: { color: '#aaa', fontSize: 14 },
  itemTime: { color: '#666', fontSize: 12, marginTop: 4 },
});
