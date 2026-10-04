const RAW_API_BASE = process.env.EXPO_PUBLIC_API_URL?.trim();
const API_BASE = (RAW_API_BASE || 'http://localhost:4000').replace(/\/$/, '');

export const config = {
  apiBase: API_BASE,
  apiBaseExplicit: Boolean(RAW_API_BASE),
  pingIntervalSec: 10,
  /** Development-build field control only; never exposed as a production preference. */
  m4NativeBenchmarkEnabled:
    __DEV__ && process.env.EXPO_PUBLIC_M4_NATIVE_BENCHMARK_ENABLED === 'true',
};

export function apiConfigurationProblem(): string | null {
  if (!config.apiBaseExplicit) {
    return 'EXPO_PUBLIC_API_URL is not configured. A physical iPhone cannot use the localhost fallback; point it to the PR #17 development backend.';
  }
  return null;
}
