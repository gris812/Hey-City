import type { StoryRating } from '@heycity/shared';
import { apiFetch } from './client';

export interface DriveDiscoverySettings {
  enabled: boolean;
  themeTags: string[];
  narrationStyle: string;
  lengthSec: number;
  leadTimeMin: number;
  autoplay: boolean;
  voiceId: string;
  languageDefault: 'ru' | 'en' | 'auto';
}

export interface Profile {
  id: string;
  email: string;
  languageDefault: 'ru' | 'en' | 'auto';
  historyEnabled: boolean;
  driveDiscovery: DriveDiscoverySettings;
  history?: HistoryItem[];
}

export interface HistoryItem {
  id: string;
  type: string;
  placeId?: string;
  timestamp: string;
  theme?: string;
  style?: string;
  tourId?: string;
  visitedTargetIds?: string[];
  completedAt?: string;
  guideId?: 'dana' | 'arthur';
  guideLanguage?: 'en' | 'ru';
  metadata?: { artifactId?: string; placeName?: string; outcome?: string; rating?: StoryRating };
  completionStatus?: 'completed' | 'partial' | 'stopped';
}

export async function getProfile(): Promise<Profile> {
  return apiFetch<Profile>('/me');
}

export async function updateProfile(patch: Partial<Pick<Profile, 'languageDefault' | 'driveDiscovery'>>): Promise<Profile> {
  return apiFetch<Profile>('/me', { method: 'PUT', body: patch });
}

export async function updatePrivacy(historyEnabled: boolean): Promise<void> {
  await apiFetch('/me/privacy', { method: 'PUT', body: { historyEnabled } });
}

export async function deleteAllHistory(): Promise<void> {
  await apiFetch('/me/history', { method: 'DELETE' });
}

export async function deleteHistoryItems(ids: string[]): Promise<void> {
  await apiFetch('/me/history/items', { method: 'DELETE', body: { ids } });
}

export async function rateCompletedStory(id: string, rating: StoryRating): Promise<StoryRating> {
  const result = await apiFetch<{ rating: StoryRating }>(`/me/history/items/${encodeURIComponent(id)}/rating`,
    { method: 'PUT', body: { rating } });
  return result.rating;
}
