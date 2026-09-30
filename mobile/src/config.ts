const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export const config = {
  apiBase: API_BASE,
  pingIntervalSec: 10,
  /** Development-build field control only; never exposed as a production preference. */
  m4NativeBenchmarkEnabled:
    __DEV__ && process.env.EXPO_PUBLIC_M4_NATIVE_BENCHMARK_ENABLED === 'true',
};
