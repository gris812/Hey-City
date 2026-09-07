import { randomUUID } from 'node:crypto';
import { databaseEnabled, query } from './database';

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
  if (databaseEnabled()) {
    const [row] = await query<UserRow>(
      `INSERT INTO users(id,email,drive_discovery) VALUES($1,$2,$3::jsonb)
       ON CONFLICT(email) DO UPDATE SET last_seen_at=now()
       RETURNING id,email,language_default,history_enabled,drive_discovery,created_at`,
      [`user_${randomUUID()}`, email, JSON.stringify(defaultDriveDiscovery)]);
    return fromRow(row);
  }
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
  if (databaseEnabled()) {
    const [row] = await query<UserRow>('SELECT id,email,language_default,history_enabled,drive_discovery,created_at FROM users WHERE id=$1', [id]);
    return row ? fromRow(row) : null;
  }
  return users.get(id) ?? null;
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<UserProfile, 'languageDefault' | 'historyEnabled' | 'driveDiscovery'>>
): Promise<UserProfile | null> {
  if (databaseEnabled()) {
    const current = await getUserById(id);
    if (!current) return null;
    const nextDrive = patch.driveDiscovery ? { ...current.driveDiscovery, ...patch.driveDiscovery } : current.driveDiscovery;
    const [row] = await query<UserRow>(
      `UPDATE users SET language_default=$2, history_enabled=$3, drive_discovery=$4::jsonb, last_seen_at=now()
       WHERE id=$1 RETURNING id,email,language_default,history_enabled,drive_discovery,created_at`,
      [id, patch.languageDefault ?? current.languageDefault, patch.historyEnabled ?? current.historyEnabled, JSON.stringify(nextDrive)]);
    return fromRow(row);
  }
  const user = users.get(id);
  if (!user) return null;
  if (patch.languageDefault !== undefined) user.languageDefault = patch.languageDefault;
  if (patch.historyEnabled !== undefined) user.historyEnabled = patch.historyEnabled;
  if (patch.driveDiscovery !== undefined) {
    user.driveDiscovery = { ...user.driveDiscovery, ...patch.driveDiscovery };
  }
  return user;
}

interface UserRow {
  id: string;
  email: string;
  language_default: UserProfile['languageDefault'];
  history_enabled: boolean;
  drive_discovery: DriveDiscoverySettings;
  created_at: Date | string;
}

function fromRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    languageDefault: row.language_default,
    historyEnabled: row.history_enabled,
    driveDiscovery: row.drive_discovery,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
