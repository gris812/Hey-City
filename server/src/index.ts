import { assertProductionConfig, server } from './config';
import { createApp } from './app';
import { initializeDatabase } from './services/database';

async function start(): Promise<void> {
  assertProductionConfig();
  await initializeDatabase();
  createApp().listen(server.port, () => console.log(`Hey City API listening on port ${server.port}`));
}

void start().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
