import React, { createContext, useContext, useEffect, useState } from 'react';
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
import {
  createInitialGuestPreferences,
  sanitizeGuestPreferences,
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
  completeOnboarding: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);
const GUEST_ID_KEY = 'guest_id';
const APP_LANGUAGE_KEY = 'pref_app_language';
const GUIDE_LANGUAGE_KEY = 'pref_guide_language';
const PREFERRED_GUIDE_KEY = 'pref_guide_id';
const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';
const SHOW_ONBOARDING_AT_LAUNCH_KEY = 'show_onboarding_at_launch';

async function getOrCreateGuestId(): Promise<string> {
  const storedGuestId = await SecureStore.getItemAsync(GUEST_ID_KEY);
  if (storedGuestId) return storedGuestId;

  const guestId = createGuestId();
  await SecureStore.setItemAsync(GUEST_ID_KEY, guestId);
  return guestId;
}

async function readPreferences(): Promise<GuestPreferences> {
  const systemLocale = getSystemLocale();
  const [appLanguage, guideLanguage, preferredGuideId, onboardingCompleted, showOnboardingAtLaunch] =
    await Promise.all([
      SecureStore.getItemAsync(APP_LANGUAGE_KEY),
      SecureStore.getItemAsync(GUIDE_LANGUAGE_KEY),
      SecureStore.getItemAsync(PREFERRED_GUIDE_KEY),
      SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY),
      SecureStore.getItemAsync(SHOW_ONBOARDING_AT_LAUNCH_KEY),
    ]);

  const hasStoredPreferences =
    appLanguage !== null ||
    guideLanguage !== null ||
    preferredGuideId !== null ||
    onboardingCompleted !== null ||
    showOnboardingAtLaunch !== null;

  if (!hasStoredPreferences) {
    const initial = createInitialGuestPreferences(systemLocale);
    await persistPreferences(initial);
    return initial;
  }

  return sanitizeGuestPreferences(
    {
      appLanguage,
      guideLanguage,
      preferredGuideId,
      onboardingCompleted: onboardingCompleted === 'true',
      showOnboardingAtLaunch:
        showOnboardingAtLaunch === null ? null : showOnboardingAtLaunch === 'true',
    },
    systemLocale
  );
}

async function persistPreferences(preferences: GuestPreferences): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(APP_LANGUAGE_KEY, preferences.appLanguage),
    SecureStore.setItemAsync(GUIDE_LANGUAGE_KEY, preferences.guideLanguage),
    SecureStore.setItemAsync(PREFERRED_GUIDE_KEY, preferences.preferredGuideId),
    SecureStore.setItemAsync(
      ONBOARDING_COMPLETED_KEY,
      preferences.onboardingCompleted ? 'true' : 'false'
    ),
    SecureStore.setItemAsync(
      SHOW_ONBOARDING_AT_LAUNCH_KEY,
      preferences.showOnboardingAtLaunch ? 'true' : 'false'
    ),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<AppIdentityState>({ status: 'loading' });
  const [preferences, setPreferences] = useState<GuestPreferences>(
    createInitialGuestPreferences(getSystemLocale())
  );

  useEffect(() => {
    let mounted = true;

    const becomeGuest = async () => {
      const guestId = await getOrCreateGuestId();
      if (mounted) setIdentity({ status: 'guest', guestId });
    };

    setAuthInvalidationHandler(async () => {
      await becomeGuest();
    });

    Promise.all([getToken(), getOrCreateGuestId(), readPreferences()]).then(([t, guestId, prefs]) => {
      if (!mounted) return;
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
    setPreferences((current) => {
      const next = { ...current, ...patch };
      void persistPreferences(next);
      return next;
    });
  };

  const completeOnboarding = async () => {
    await updatePreferences({ onboardingCompleted: true });
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
