import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { jwt as jwtConfig } from '../config';
import { sendOtpEmail, verifyOtp as verifyOtpStore } from '../services/emailOtp';
import { getOrCreateUser } from '../services/user';
import { JwtPayload } from '../middleware/auth';

export async function sendOtp(req: Request, res: Response): Promise<void> {
  const email = (req.body?.email as string)?.trim()?.toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Email required' });
    return;
  }

  try {
    await sendOtpEmail(email);
    res.json({ ok: true, message: 'OTP sent' });
  } catch (e) {
    console.error('sendOtp', e);
    res.status(500).json({ error: 'Failed to send OTP' });
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
    const payload: JwtPayload = { userId: user.id, email: user.email };
    const token = jwt.sign(payload, jwtConfig.secret, { expiresIn: 30 * 24 * 60 * 60 }); // 30 days in sec

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('verifyOtp', e);
    res.status(500).json({ error: 'Verification failed' });
  }
}
