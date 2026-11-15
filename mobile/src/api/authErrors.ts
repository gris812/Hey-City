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
): boolean {
  if (path.startsWith('/auth/')) return false;
  return isAuthenticationFailure(status);
}
