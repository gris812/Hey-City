import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { media, production, server } from './config';
import { adminRouter } from './routes/admin';
import { usageRouter } from './routes/usage';
import { discoveryRouter, poisRouter, sessionsRouter, storiesRouter } from './routes/canonical';
import { authRouter } from './routes/auth';
import { driveRouter } from './routes/drive';
import { healthRouter } from './routes/health';
import { meRouter } from './routes/me';
import { narrationRouter } from './routes/narration';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  if (server.nodeEnv === 'production') app.use(helmet());
  app.use(cors({ origin(origin, callback) {
    if (!origin || production.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  } }));
  app.use(express.json({ limit: '256kb' }));
  app.use('/media', express.static(media.directory, { maxAge: '30d', immutable: true }));

  app.get('/', (_req, res) => {
    res.json({
      service: 'hey-city-api',
      status: 'ok',
      mode: 'backend-api',
      health: '/health',
      note: 'Hey City WebApp is a separate frontend stage.',
    });
  });

  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/admin', adminRouter);
  app.use('/usage', usageRouter);
  app.use('/me', meRouter);
  app.use('/drive', driveRouter);
  app.use('/narration', narrationRouter);
  app.use('/sessions', sessionsRouter);
  app.use('/discovery', discoveryRouter);
  app.use('/stories', storiesRouter);
  app.use('/pois', poisRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
