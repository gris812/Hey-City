import * as SecureStore from 'expo-secure-store';
import { config } from '../config';
import { SessionCredentials, type Credentials } from './sessionCredentials';
import {
  AUTH_SESSION_EXPIRED_MESSAGE,
  GENERIC_REQUEST_ERROR_MESSAGE,
  shouldInvalidateStoredSession,
  toUserSafeRequestMessage,
} from './authErrors';

const TOKEN_KEY = 'auth_token';
const session = new SessionCredentials({
  read: () => SecureStore.getItemAsync(TOKEN_KEY),
  write: value => value === null
    ? SecureStore.deleteItemAsync(TOKEN_KEY)
    : SecureStore.setItemAsync(TOKEN_KEY, value),
});
let authInvalidationHandler: (() => void) | null = null;

export class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'ApiRequestError'; }
}

export class AuthSessionExpiredError extends Error {
  readonly isAuthSessionExpired = true;

  constructor() {
    super(AUTH_SESSION_EXPIRED_MESSAGE);
    this.name = 'AuthSessionExpiredError';
  }
}

export function setAuthInvalidationHandler(handler: (() => void) | null): void {
  authInvalidationHandler = handler;
}

export async function getToken(): Promise<string | null> {
  return (await session.read()).credentials?.token ?? null;
}

export async function setToken(token: string, refreshToken?: string): Promise<void> {
  await session.replace({ token, refreshToken });
}

function invalidate(): void {
  authInvalidationHandler?.();
}

async function request(path: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(`${config.apiBase}${path}`, options);
  } catch {
    throw new Error('Hey City API is unreachable. Check your connection and development API configuration.');
  }
}

async function sessionRequest(action: 'refresh' | 'logout', refreshToken: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    return await request(`/auth/session/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function refresh(refreshToken: string): Promise<Credentials | null> {
  const response = await sessionRequest('refresh', refreshToken);
  if (response.status === 401) return null;
  if (!response.ok) throw new ApiRequestError(response.status, 'Session service unavailable');
  const next = await response.json() as Partial<Credentials>;
  if (typeof next.token !== 'string' || !next.token || typeof next.refreshToken !== 'string' || !next.refreshToken) {
    throw new Error('Invalid session service response');
  }
  return { token: next.token, refreshToken: next.refreshToken };
}

export async function clearToken(): Promise<void> {
  const { credentials } = await session.replace(null);
  if (credentials?.refreshToken) {
    void sessionRequest('logout', credentials.refreshToken).then(response => {
      if (!response.ok) console.warn('session_revocation_failed', response.status);
    }, () => { console.warn('session_revocation_unreachable'); });
  }
}

export async function restoreToken(): Promise<string | null> {
  if (!await getToken()) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    await apiFetch('/me', { signal: controller.signal });
  } catch {
    // A definitive rejection clears the matching snapshot in apiFetch.
    // An offline launch or service outage retains local identity.
  } finally {
    clearTimeout(timeout);
  }
  return getToken();
}

export async function apiFetch<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const snapshot = await session.read();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = path.startsWith('/auth/') || headers.has('x-hey-city-guest-id') ? undefined : snapshot.credentials?.token;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;
  let response = await request(path, { ...options, headers, body });

  if (token && shouldInvalidateStoredSession(path, response.status)) {
    const renewed = await session.recover(snapshot, refresh, invalidate);
    if (!renewed?.credentials || (await session.read()).generation !== snapshot.generation) {
      throw new AuthSessionExpiredError();
    }
    headers.set('Authorization', `Bearer ${renewed.credentials.token}`);
    response = await request(path, { ...options, headers, body });
    if (response.status === 401) {
      // Limit each request to a single renewal. A retry can fail independently
      // and a newer credential may already be in use by another request.
      throw new ApiRequestError(response.status, AUTH_SESSION_EXPIRED_MESSAGE);
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    const backendMessage = (err as { error?: string }).error;
    if (path.startsWith('/auth/') && [400, 401, 403, 429].includes(response.status)) {
      throw new Error(backendMessage || GENERIC_REQUEST_ERROR_MESSAGE);
    }
    throw new ApiRequestError(response.status, toUserSafeRequestMessage(response.status, backendMessage));
  }
  return response.json() as Promise<T>;
}
