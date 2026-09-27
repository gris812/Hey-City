import type { ConversationNearbyProvider } from '../conversation/tools/types';

export type { ConversationNearbyProvider } from '../conversation/tools/types';

/** The runtime depends on this contract rather than a Google/Discovery implementation. */
export function assertConversationNearbyProvider(value: unknown): ConversationNearbyProvider {
  if (!value || typeof (value as ConversationNearbyProvider).searchNearby !== 'function') {
    throw new Error('Invalid conversation nearby provider');
  }
  return value as ConversationNearbyProvider;
}

