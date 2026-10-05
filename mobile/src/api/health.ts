import { config } from '../config';

export type ApiCompatibility = {
  reachable: boolean;
  compatible: boolean;
  service?: string;
  buildSha?: string;
  capabilities: string[];
  reason?: string;
};

export function classifyApiHealthPayload(payload: unknown): ApiCompatibility {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities.filter((item): item is string => typeof item === 'string')
    : [];
  const service = typeof record.service === 'string' ? record.service : undefined;
  const buildSha = typeof record.buildSha === 'string' ? record.buildSha : undefined;
  const compatible = service === 'hey-city-api' && capabilities.includes('m4_realtime_voice');
  return {
    reachable: true,
    compatible,
    service,
    buildSha,
    capabilities,
    ...(!compatible ? { reason: 'Backend does not expose the PR #17 M4 realtime capability.' } : {}),
  };
}

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
    return classifyApiHealthPayload(await response.json());
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError'
      ? 'API health check timed out.'
      : 'API is unreachable from this device.';
    return { reachable: false, compatible: false, capabilities: [], reason };
  } finally {
    clearTimeout(timer);
  }
}
