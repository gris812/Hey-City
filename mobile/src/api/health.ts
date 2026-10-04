import { config } from '../config';

export type ApiCompatibility = {
  reachable: boolean;
  compatible: boolean;
  service?: string;
  buildSha?: string;
  capabilities: string[];
  reason?: string;
};

export async function checkApiCompatibility(timeoutMs = 5000): Promise<ApiCompatibility> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.apiBase}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { reachable: true, compatible: false, capabilities: [], reason: `HTTP ${response.status}` };
    }
    const payload = await response.json() as {
      service?: unknown;
      buildSha?: unknown;
      capabilities?: unknown;
    };
    const capabilities = Array.isArray(payload.capabilities)
      ? payload.capabilities.filter((item): item is string => typeof item === 'string')
      : [];
    const service = typeof payload.service === 'string' ? payload.service : undefined;
    const buildSha = typeof payload.buildSha === 'string' ? payload.buildSha : undefined;
    const compatible = service === 'hey-city-api' && capabilities.includes('m4_realtime_voice');
    return {
      reachable: true,
      compatible,
      service,
      buildSha,
      capabilities,
      ...(!compatible ? { reason: 'Backend does not expose the PR #17 M4 realtime capability.' } : {}),
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError'
      ? 'API health check timed out.'
      : 'API is unreachable from this device.';
    return { reachable: false, compatible: false, capabilities: [], reason };
  } finally {
    clearTimeout(timer);
  }
}
