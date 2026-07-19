export const AUTH_SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';
export const GENERIC_REQUEST_ERROR_MESSAGE = 'Request failed. Please try again.';

const AUTH_MESSAGE_PATTERN = /(invalid|expired|unauthorized|jwt)/i;

export function isAuthenticationFailure(status: number, message?: string): boolean {
  if (status === 401) return true;
  if (status === 403 && message && AUTH_MESSAGE_PATTERN.test(message)) return true;
  return false;
}

export function toUserSafeRequestMessage(status: number, message?: string): string {
  if (isAuthenticationFailure(status, message)) return AUTH_SESSION_EXPIRED_MESSAGE;
  return message || GENERIC_REQUEST_ERROR_MESSAGE;
}
