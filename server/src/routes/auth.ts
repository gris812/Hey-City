import { Router } from 'express';
import { sendOtp, verifyOtp } from '../controllers/auth';
import rateLimit from 'express-rate-limit';

export const authRouter = Router();

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
authRouter.post('/otp/send', otpLimiter, sendOtp);
authRouter.post('/otp/verify', otpLimiter, verifyOtp);
