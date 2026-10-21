import type { OtpDeliveryMode } from '../../api/auth';
import type { TranslationKey } from '../../localization/translations';

/** Server's delivery contract determines field type; not every code is an email OTP. */
export function otpCodeEntry(delivery: OtpDeliveryMode | null) {
  const admin = delivery === 'admin_code';
  return {
    maxLength: admin ? 128 : 6,
    keyboardType: admin ? 'default' as const : 'number-pad' as const,
    canVerify: (value: string) => admin ? value.trim().length > 0 : /^\d{6}$/.test(value.trim()),
    canResend: !admin,
  };
}

/** Admin code is an opaque secret: never normalize or trim it before verification. */
export function normalizeSubmittedCode(delivery: OtpDeliveryMode | null, value: string): string {
  return delivery === 'admin_code' ? value : value.trim();
}

export function authErrorTranslationKey(
  message: string,
  delivery: OtpDeliveryMode | null,
): TranslationKey | null {
  if (message === 'Invalid or expired OTP') {
    return delivery === 'admin_code' ? 'auth.invalidAdminCode' : 'auth.invalidOtp';
  }
  if (message === 'Email is not enabled for the field test') return 'auth.emailNotAllowed';
  if (message === 'Administrator access code is not configured on this server') return 'auth.adminUnavailable';
  if (message.toLowerCase().includes('too many requests')) return 'auth.rateLimited';
  return null;
}
