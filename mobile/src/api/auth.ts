import { apiFetch } from './client';

export type OtpDeliveryMode = 'email' | 'development_console' | 'admin_code';

export async function sendOtp(email: string): Promise<{ ok: boolean; delivery: OtpDeliveryMode; message: string }> {
  return apiFetch('/auth/otp/send', { method: 'POST', body: { email } });
}

export async function verifyOtp(email: string, code: string): Promise<{ token: string; user: { id: string; email: string } }> {
  return apiFetch('/auth/otp/verify', { method: 'POST', body: { email, code } });
}
