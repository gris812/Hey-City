/**
 * User profile and driveDiscovery settings. MVP: in-memory; production: DB (e.g. PostgreSQL).
 */
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

export interface UserProfile {
  id: string;
  email: string;
  languageDefault: 'ru' | 'en' | 'auto';
  historyEnabled: boolean;
  driveDiscovery: DriveDiscoverySettings;
  createdAt: string;
}

const users = new Map<string, UserProfile>();

const defaultDriveDiscovery: DriveDiscoverySettings = {
  enabled: false,
  themeTags: ['mixed'],
  narrationStyle: 'documentary',
  lengthSec: 90,
  leadTimeMin: 2,
  autoplay: true,
  voiceId: 'default',
  languageDefault: 'auto',
};

// ✅ DEV seed user for AUTH_DISABLED / development
function seedDevUser(): void {
  const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true' || process.env.NODE_ENV === 'development';
  if (!AUTH_DISABLED) return;

  const id = 'gris';
  if (users.has(id)) return;

  const profile: UserProfile = {
    id,
    email: 'g.slepak@icloud.com',
    languageDefault: 'auto',
    historyEnabled: true,
    driveDiscovery: { ...defaultDriveDiscovery },
    createdAt: new Date().toISOString(),
  };

  users.set(id, profile);
}

// вызываем при импорте модуля (idempotent)
seedDevUser();

export async function getOrCreateUser(email: string): Promise<UserProfile> {
  const existing = Array.from(users.values()).find((u) => u.email === email);
  if (existing) return existing;

  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const profile: UserProfile = {
    id,
    email,
    languageDefault: 'auto',
    historyEnabled: true,
    driveDiscovery: { ...defaultDriveDiscovery },
    createdAt: new Date().toISOString(),
  };
  users.set(id, profile);
  return profile;
}

export async function getUserById(id: string): Promise<UserProfile | null> {
  return users.get(id) ?? null;
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<UserProfile, 'languageDefault' | 'historyEnabled' | 'driveDiscovery'>>
): Promise<UserProfile | null> {
  const user = users.get(id);
  if (!user) return null;
  if (patch.languageDefault !== undefined) user.languageDefault = patch.languageDefault;
  if (patch.historyEnabled !== undefined) user.historyEnabled = patch.historyEnabled;
  if (patch.driveDiscovery !== undefined) {
    user.driveDiscovery = { ...user.driveDiscovery, ...patch.driveDiscovery };
  }
  return user;
}