import * as SecureStore from 'expo-secure-store';
import { config } from '../config';

declare const __DEV__: boolean | undefined;

const TOKEN_KEY = 'auth_token';
const AUTH_DISABLED = process.env.EXPO_PUBLIC_AUTH_DISABLED === 'true';

export async function getToken(): Promise<string | null> {
  if (AUTH_DISABLED || __DEV__) return 'dev-token';
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function apiFetch<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;
  const res = await fetch(`${config.apiBase}${path}`, {
    ...options,
    headers,
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
