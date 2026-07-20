export type CanonicalGuideId = 'dana' | 'arthur';
export type LegacyBackendGuideId = 'dana' | 'artur';

export function normalizeGuideId(value: string | null | undefined): CanonicalGuideId {
  if (value === 'arthur' || value === 'artur') return 'arthur';
  return 'dana';
}

export function toDriveBackendVoiceId(guideId: CanonicalGuideId): LegacyBackendGuideId {
  return guideId === 'arthur' ? 'artur' : 'dana';
}

export function fromBackendGuideId(value: string | null | undefined): CanonicalGuideId {
  return normalizeGuideId(value);
}
