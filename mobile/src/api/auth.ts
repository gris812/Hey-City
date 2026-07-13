import { apiFetch } from './client';

export async function sendOtp(email: string): Promise<void> {
  await apiFetch('/auth/otp/send', { method: 'POST', body: { email } });
}

export async function verifyOtp(email: string, code: string): Promise<{ token: string; user: { id: string; email: string } }> {
  return apiFetch('/auth/otp/verify', { method: 'POST', body: { email, code } });
}
