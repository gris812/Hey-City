export const AUTH_SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';
export const GENERIC_REQUEST_ERROR_MESSAGE = 'Request failed. Please try again.';

export function isAuthenticationFailure(status: number, _message?: string): boolean {
  return status === 401;
}

export function toUserSafeRequestMessage(status: number, message?: string): string {
  if (isAuthenticationFailure(status, message)) return AUTH_SESSION_EXPIRED_MESSAGE;
  return message || GENERIC_REQUEST_ERROR_MESSAGE;
}

export function shouldInvalidateStoredSession(
  path: string,
  status: number,
  payload?: { code?: string; error?: string },
): boolean {
  if (path.startsWith('/auth/') || status !== 401) return false;
  return payload?.code === 'session_rejected' ||
    (path === '/me' && ['Invalid or expired token', 'Invalid or expired session'].includes(payload?.error ?? ''));
}
