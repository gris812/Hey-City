import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, setToken, clearToken } from '../api/client';

type AuthContextType = {
  token: string | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

// ✅ флаг для отключения авторизации
const AUTH_DISABLED = process.env.EXPO_PUBLIC_AUTH_DISABLED === 'true';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // ✅ если auth отключен — сразу считаем, что токен есть
  const [token, setTokenState] = useState<string | null>(
    AUTH_DISABLED || __DEV__ ? 'dev-token' : null
  );
  const [loading, setLoading] = useState(!(AUTH_DISABLED || __DEV__));

  useEffect(() => {
    // ✅ в bypass режиме вообще не читаем storage и не делаем лишнего
    if (AUTH_DISABLED || __DEV__) return;

    getToken().then((t) => {
      setTokenState(t);
      setLoading(false);
    });
  }, []);

  const login = async (t: string) => {
    // ✅ в bypass режиме можно просто установить токен в стейт
    if (AUTH_DISABLED || __DEV__) {
      setTokenState(t || 'dev-token');
      return;
    }
    await setToken(t);
    setTokenState(t);
  };

  const logout = async () => {
    // ✅ в bypass режиме не разлогиниваем, чтобы не вернуться на LoginScreen
    if (AUTH_DISABLED || __DEV__) {
      setTokenState('dev-token');
      return;
    }
    await clearToken();
    setTokenState(null);
  };

  return (
    <AuthContext.Provider value={{ token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
