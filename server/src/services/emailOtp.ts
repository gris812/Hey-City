/**
 * Email OTP: send code and verify. MVP: in-memory store; production: Redis + real email provider.
 */
const otpStore = new Map<string, { code: string; expiresAt: number }>();
const OTP_TTL_MS = 10 * 60 * 1000; // 10 min
const OTP_LENGTH = 6;

function generateCode(): string {
  let s = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    s += Math.floor(Math.random() * 10);
  }
  return s;
}

export async function sendOtpEmail(email: string): Promise<void> {
  const code = generateCode();
  otpStore.set(email, { code, expiresAt: Date.now() + OTP_TTL_MS });

  // MVP: log to console. Production: use RESEND_API_KEY or SMTP
  const provider = process.env.EMAIL_PROVIDER || 'console';
  if (provider === 'console') {
    console.log(`[OTP] ${email} -> ${code}`);
    return;
  }
  // TODO: integrate Resend/SendGrid/SMTP
  throw new Error('Email provider not configured. Set EMAIL_PROVIDER=console for dev.');
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const entry = otpStore.get(email);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email);
    return false;
  }
  if (entry.code !== code) return false;
  otpStore.delete(email);
  return true;
}
