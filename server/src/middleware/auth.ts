import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwt as jwtConfig } from '../config';

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

const GUEST_ID_PATTERN = /^guest_[a-z0-9]+_[a-z0-9]{7}$/;

export function requireAuthOrGuest(req: AuthRequest, res: Response, next: NextFunction): void {
  const guestId = req.header('x-hey-city-guest-id');
  if (guestId) {
    if (!GUEST_ID_PATTERN.test(guestId)) {
      res.status(400).json({ error: 'Invalid guest identity' });
      return;
    }
    req.user = { userId: guestId, email: '' };
    next();
    return;
  }

  requireAuth(req, res, next);
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true';

  // ✅ DEV/BYPASS: фиксированный пользователь для тестирования
  if (AUTH_DISABLED || process.env.NODE_ENV === 'development') {
    req.user = { userId: 'gris', email: 'g.slepak@icloud.com' };
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtConfig.secret) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
