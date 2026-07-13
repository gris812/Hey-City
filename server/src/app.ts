import cors from 'cors';
import express from 'express';
import { discoveryRouter, poisRouter, sessionsRouter, storiesRouter } from './routes/canonical';
import { authRouter } from './routes/auth';
import { driveRouter } from './routes/drive';
import { healthRouter } from './routes/health';
import { meRouter } from './routes/me';
import { narrationRouter } from './routes/narration';

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
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

  return app;
}

