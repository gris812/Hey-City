import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import * as Location from 'expo-location';

export function MapScreen() {
  const [region, setRegion] = useState<Region | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Нет доступа к геолокации');
          setRegion({
            latitude: 55.7558,
            longitude: 37.6173,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          });
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        setRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      } catch (e) {
        setError((e as Error).message);
        setRegion({
          latitude: 55.7558,
          longitude: 37.6173,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      }
    })();
  }, []);

  if (error && !region) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!region) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e94560" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' },
  errorText: { color: '#e94560', padding: 20 },
});
