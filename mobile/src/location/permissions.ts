import * as Location from 'expo-location';
import type { LocationPermissionResult } from './types';

export async function requestForegroundLocationPermission(): Promise<LocationPermissionResult> {
  const result = await Location.requestForegroundPermissionsAsync();
  if (result.status === 'granted') return 'granted';
  if (result.canAskAgain === false) return 'restricted';
  return 'denied';
}
