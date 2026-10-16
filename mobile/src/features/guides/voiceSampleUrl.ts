export function resolveVoiceSampleUrl(audioUrl: string, apiBase: string): string {
  const trimmed = audioUrl.trim();
  if (!trimmed) throw new Error('Voice sample did not return an audio URL.');

  const normalizedApiBase = apiBase.replace(/\/$/, '');
  if (trimmed.startsWith('/')) return `${normalizedApiBase}${trimmed}`;

  try {
    const parsed = new URL(trimmed);
    const loopback =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';
    if (!loopback) return trimmed;
    return `${normalizedApiBase}${parsed.pathname}${parsed.search}`;
  } catch {
    throw new Error('Voice sample returned an invalid audio URL.');
  }
}
