import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { auth, server } from '../config';
import { databaseEnabled, query } from './database';
import { recordUsage } from './usage';

const memoryStore = new Map<string, { codeHash: string; expiresAt: number; attempts: number }>();
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(email: string, code: string): string {
  return createHash('sha256').update(`${email}:${code}:${auth.otpPepper}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAdminEmail(email: string): boolean {
  return Boolean(auth.adminEmail) && email === auth.adminEmail;
}

export function isEmailAllowed(email: string): boolean {
  return isAdminEmail(email) || auth.testerAllowlist.length === 0 || auth.testerAllowlist.includes(email);
}

export async function sendOtpEmail(email: string): Promise<void> {
  if (!isEmailAllowed(email)) throw new Error('EMAIL_NOT_ALLOWED');
  if (isAdminEmail(email)) return;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = hashCode(email, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  if (databaseEnabled()) {
    await query(`INSERT INTO otp_challenges(email, code_hash, expires_at, attempts, created_at)
      VALUES($1,$2,$3,0,now()) ON CONFLICT(email) DO UPDATE SET
      code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, created_at=now()`,
      [email, codeHash, expiresAt]);
  } else memoryStore.set(email, { codeHash, expiresAt: expiresAt.getTime(), attempts: 0 });

  if (server.nodeEnv !== 'production' && !auth.resendApiKey) {
    console.log(`[OTP development] ${email} -> ${code}`);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: auth.fromEmail, to: [email], subject: 'Код входа в Hey City',
      html: `<div style="font-family:Arial,sans-serif;color:#172019"><p>Ваш код входа в Hey City:</p><p style="font-size:32px;letter-spacing:6px"><strong>${code}</strong></p><p>Код действует 10 минут.</p></div>`,
      text: `Ваш код входа в Hey City: ${code}. Код действует 10 минут.`,
    }),
  });
  if (!response.ok) throw new Error(`Resend rejected email (${response.status}): ${(await response.text()).slice(0, 200)}`);
  await recordUsage({ category: 'auth', operation: 'resend_email' });
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  if (isAdminEmail(email)) return auth.adminCode.length > 0 && safeEqual(code, auth.adminCode);
  const expected = hashCode(email, code);
  if (databaseEnabled()) {
    const [entry] = await query<{ code_hash: string; attempts: number; valid: boolean }>(
      `UPDATE otp_challenges SET attempts=attempts+1 WHERE email=$1
       RETURNING code_hash, attempts, expires_at > now() AS valid`, [email]);
    if (!entry || !entry.valid || entry.attempts > MAX_ATTEMPTS || !safeEqual(expected, entry.code_hash)) return false;
    await query('DELETE FROM otp_challenges WHERE email=$1', [email]);
    return true;
  }
  const entry = memoryStore.get(email);
  if (!entry || Date.now() > entry.expiresAt || ++entry.attempts > MAX_ATTEMPTS) return false;
  if (!safeEqual(expected, entry.codeHash)) return false;
  memoryStore.delete(email);
  return true;
}
