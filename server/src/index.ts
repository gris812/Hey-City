import { assertProductionConfig, server } from './config';
import { createApp } from './app';
import { initializeDatabase, pruneStoryExperience } from './services/database';
import { initializeGuides } from './services/guides';

async function start(): Promise<void> {
  assertProductionConfig();
  await initializeDatabase();
  await initializeGuides();
  const retention = setInterval(() => void pruneStoryExperience()
    .catch(() => console.warn('story_experience_retention_failed')), 60 * 60 * 1000);
  retention.unref();
  createApp().listen(server.port, () => console.log(`Hey City API listening on port ${server.port}`));
}

void start().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
