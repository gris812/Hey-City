import { Router } from 'express';
import { sendOtp, verifyOtp } from '../controllers/auth';

export const authRouter = Router();

authRouter.post('/otp/send', sendOtp);
authRouter.post('/otp/verify', verifyOtp);
