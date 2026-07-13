import { server } from './config';
import { createApp } from './app';

createApp().listen(server.port, () => {
  console.log(`Sunshine AI Guide API listening on port ${server.port}`);
});
