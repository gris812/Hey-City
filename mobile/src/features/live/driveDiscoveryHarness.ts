import type { GuidePreference } from '../../localization/preferences';
import { toDriveBackendVoiceId } from '../../localization/guideIds';

export type DriveDiscoveryHarness = {
  sessionId: string | null;
  guideId: GuidePreference;
  backendVoiceId: 'dana' | 'artur';
  startCalls: number;
  pingCalls: number;
  intervalCreated: boolean;
  intervalCleared: boolean;
  cleanedUp: boolean;
};

export function createDriveDiscoveryHarness(guideId: GuidePreference): DriveDiscoveryHarness {
  return {
    sessionId: null,
    guideId,
    backendVoiceId: toDriveBackendVoiceId(guideId),
    startCalls: 0,
    pingCalls: 0,
    intervalCreated: false,
    intervalCleared: false,
    cleanedUp: false,
  };
}

export function startDriveDiscoveryHarness(
  harness: DriveDiscoveryHarness,
  sessionId = 'drive-session-test'
): DriveDiscoveryHarness {
  return {
    ...harness,
    sessionId,
    startCalls: harness.startCalls + 1,
    intervalCreated: true,
  };
}

export function pingDriveDiscoveryHarness(harness: DriveDiscoveryHarness): DriveDiscoveryHarness {
  if (!harness.sessionId || harness.cleanedUp) return harness;
  return { ...harness, pingCalls: harness.pingCalls + 1 };
}

export function stopDriveDiscoveryHarness(harness: DriveDiscoveryHarness): DriveDiscoveryHarness {
  return {
    ...harness,
    sessionId: null,
    intervalCleared: harness.intervalCreated,
    cleanedUp: true,
  };
}
