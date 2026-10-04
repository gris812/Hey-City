import * as SecureStore from 'expo-secure-store';
import { config } from '../config';
import {
  AUTH_SESSION_EXPIRED_MESSAGE,
  isAuthenticationFailure,
  shouldInvalidateStoredSession,
  toUserSafeRequestMessage,
} from './authErrors';

const TOKEN_KEY = 'auth_token';
let authInvalidationHandler: (() => void | Promise<void>) | null = null;

export class AuthSessionExpiredError extends Error {
  readonly isAuthSessionExpired = true;

  constructor() {
    super(AUTH_SESSION_EXPIRED_MESSAGE);
    this.name = 'AuthSessionExpiredError';
  }
}

export function setAuthInvalidationHandler(handler: (() => void | Promise<void>) | null): void {
  authInvalidationHandler = handler;
}

export async function getToken(): Promise<string | null> {
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
  let res: Response;
  try {
    res = await fetch(`${config.apiBase}${path}`, {
      ...options,
      headers,
      body,
    });
  } catch {
    throw new Error('Hey City API is unreachable. Check your connection and development API configuration.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const backendMessage = (err as { error?: string }).error;

    // OTP verification uses HTTP 401 for an invalid/expired one-time code.
    // That is not an existing app-session failure and must not be rewritten as
    // "session expired" or clear a valid stored session.
    if (path.startsWith('/auth/') && (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429)) {
      throw new Error(backendMessage || GENERIC_REQUEST_ERROR_MESSAGE);
    }

    if (shouldInvalidateStoredSession(path, res.status, backendMessage)) {
      await clearToken();
      await authInvalidationHandler?.();
      throw new AuthSessionExpiredError();
    }

    throw new Error(toUserSafeRequestMessage(res.status, backendMessage));
  }
  return res.json() as Promise<T>;
}
