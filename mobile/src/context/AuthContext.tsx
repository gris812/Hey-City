import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  getToken,
  setToken,
  clearToken,
  setAuthInvalidationHandler,
} from '../api/client';
import {
  AppIdentityState,
  createGuestId,
  identityFromStoredToken,
} from './appIdentity';
import {
  getSystemLocale,
  type GuestPreferences,
} from '../localization/locales';
import { readPreferences, persistPreferences } from './preferenceStorage';
import {
  createInitialGuestPreferences,
} from '../localization/preferences';

type AuthContextType = {
  identity: AppIdentityState;
  preferences: GuestPreferences;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (patch: Partial<GuestPreferences>) => Promise<void>;
  completeWelcomeExperience: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);
const GUEST_ID_KEY = 'guest_id';

async function getOrCreateGuestId(): Promise<string> {
  const storedGuestId = await SecureStore.getItemAsync(GUEST_ID_KEY);
  if (storedGuestId) return storedGuestId;

  const guestId = createGuestId();
  await SecureStore.setItemAsync(GUEST_ID_KEY, guestId);
  return guestId;
}


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<AppIdentityState>({ status: 'loading' });
  const [preferences, setPreferences] = useState<GuestPreferences>(
    createInitialGuestPreferences(getSystemLocale())
  );

  const preferencesRef = useRef(preferences);
  const preferenceWriteRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let mounted = true;

    const becomeGuest = async () => {
      const guestId = await getOrCreateGuestId();
      if (mounted) setIdentity({ status: 'guest', guestId });
    };

    setAuthInvalidationHandler(async () => {
      await becomeGuest();
    });

    Promise.all([getToken(), getOrCreateGuestId(), readPreferences(SecureStore, getSystemLocale())]).then(([t, guestId, prefs]) => {
      if (!mounted) return;
      preferencesRef.current = prefs;
      setPreferences(prefs);
      setIdentity(identityFromStoredToken(t, guestId));
    });

    return () => {
      mounted = false;
      setAuthInvalidationHandler(null);
    };
  }, []);

  const login = async (t: string) => {
    await setToken(t);
    setIdentity({ status: 'authenticated', token: t });
  };

  const logout = async () => {
    await clearToken();
    const guestId = await getOrCreateGuestId();
    setIdentity({ status: 'guest', guestId });
  };

  const updatePreferences = async (patch: Partial<GuestPreferences>) => {
    const next = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    setPreferences(next);
    const write = preferenceWriteRef.current.then(() => persistPreferences(SecureStore, next));
    // Preserve write order so rapid language/units changes cannot persist an older snapshot last.
    preferenceWriteRef.current = write.catch(() => { console.warn('preferences_save_failed'); });
    await write;
  };

  const completeOnboarding = async () => {
    await updatePreferences({ onboardingCompleted: true });
  };

  const completeWelcomeExperience = async () => {
    await updatePreferences({ welcomeExperienceSeen: true });
  };

  const token = identity.status === 'authenticated' ? identity.token : null;
  const loading = identity.status === 'loading';
  const isAuthenticated = identity.status === 'authenticated';

  return (
    <AuthContext.Provider
      value={{
        identity,
        preferences,
        token,
        loading,
        isAuthenticated,
        login,
        logout,
        updatePreferences,
        completeWelcomeExperience,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
