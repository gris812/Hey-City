import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { jwt as jwtConfig } from '../config';
import { isAdminEmail, sendOtpEmail, verifyOtp as verifyOtpStore } from '../services/emailOtp';
import { getOrCreateUser } from '../services/user';
import { JwtPayload } from '../middleware/auth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendOtp(req: Request, res: Response): Promise<void> {
  const email = (req.body?.email as string)?.trim()?.toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: 'Valid email required' });
    return;
  }

  try {
    await sendOtpEmail(email);
    res.json({ ok: true, message: isAdminEmail(email) ? 'Enter administrator access code' : 'OTP sent' });
  } catch (e) {
    console.error('sendOtp', e);
    if (e instanceof Error && e.message === 'EMAIL_NOT_ALLOWED') {
      res.status(403).json({ error: 'Email is not enabled for the field test' });
      return;
    }
    res.status(502).json({ error: 'Failed to send OTP' });
  }
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const email = (req.body?.email as string)?.trim()?.toLowerCase();
  const code = req.body?.code as string;

  if (!email || !code) {
    res.status(400).json({ error: 'Email and code required' });
    return;
  }

  try {
    const valid = await verifyOtpStore(email, code);
    if (!valid) {
      res.status(401).json({ error: 'Invalid or expired OTP' });
      return;
    }

    const user = await getOrCreateUser(email);
    const payload: JwtPayload = { userId: user.id, email: user.email, role: isAdminEmail(email) ? 'admin' : 'user' };
    const token = jwt.sign(payload, jwtConfig.secret, { expiresIn: isAdminEmail(email) ? 8 * 60 * 60 : 30 * 24 * 60 * 60 });

    res.json({ token, user: { id: user.id, email: user.email, role: payload.role } });
  } catch (e) {
    console.error('verifyOtp', e);
    res.status(500).json({ error: 'Verification failed' });
  }
}
