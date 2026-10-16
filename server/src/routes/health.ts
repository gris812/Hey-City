import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    environment: ['production', 'staging', 'development', 'test'].includes(process.env.NODE_ENV || '')
      ? process.env.NODE_ENV : 'unknown',
    service: 'hey-city-api',
    buildSha: process.env.GIT_SHA || process.env.RENDER_GIT_COMMIT || 'unknown',
    capabilities: ['core_v2_m3_conversation', 'm4_realtime_voice'],
  });
});
