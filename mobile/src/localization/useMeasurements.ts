import { useAuth } from '../context/AuthContext';
import { createMeasurementFormatter } from './measurements';

export function useMeasurements() {
  const { preferences } = useAuth();
  return createMeasurementFormatter(preferences.measurementUnits, preferences.appLanguage);
}
