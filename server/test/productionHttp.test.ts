import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGINS = 'https://heycity.example';
  const { createApp } = await import('../src/app');
  const listener = createApp().listen(0);
  try {
    const port = (listener.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/`, { headers: { Origin: 'https://heycity.example' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://heycity.example');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await response.json() as { service: string }).service, 'hey-city-api');
    console.log('productionHttp tests passed');
  } finally { listener.close(); }
}

void run();
