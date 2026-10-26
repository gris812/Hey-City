/** Pure guards for native playback ownership (not a second JourneyState). */
export type ExplicitRequest = {
  poiId: string;
  level: 'short' | 'long';
  revision: number;
};

export function isDuplicateExplicitSelection(
  request: ExplicitRequest | null, poiId: string, level: 'short' | 'long',
): boolean {
  return request?.poiId === poiId && request.level === level;
}

export function shouldAcceptAutomaticPlay(
  pendingExplicit: ExplicitRequest | null, activeMomentId: string | null,
): boolean {
  return pendingExplicit === null && !activeMomentId?.startsWith('selected:');
}

export function ownsPlaybackCallback(activeMomentId: string | null, callbackMomentId: string): boolean {
  return activeMomentId === callbackMomentId;
}

export function shouldSendCompletion(
  activeMomentId: string | null, callbackMomentId: string,
  completedMomentId: string | null,
): boolean {
  return ownsPlaybackCallback(activeMomentId, callbackMomentId) &&
    completedMomentId !== callbackMomentId;
}
