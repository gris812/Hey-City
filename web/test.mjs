import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');

function response(body, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function testLoginAndNavigation() {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://heycity.example/', runScripts: 'dangerously' });
  dom.window.HEY_CITY_CONFIG = { apiUrl: 'https://api.example', googleMapsBrowserKey: '' };
  dom.window.fetch = async (url) => {
    if (url.endsWith('/auth/otp/send')) return response({ ok: true, message: 'OTP sent' });
    if (url.endsWith('/auth/otp/verify')) return response({ token: 'test-token', user: { id: 'u1', email: 'tester@example.com', role: 'user' } });
    throw new Error(`Unexpected request: ${url}`);
  };
  dom.window.eval(source);
  assert.match(dom.window.document.body.textContent, /Город говорит/);
  dom.window.document.querySelector('#email').value = 'tester@example.com';
  dom.window.document.querySelector('#auth-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  assert.equal(dom.window.document.querySelector('#code-wrap').hidden, false);
  assert.match(dom.window.document.querySelector('#auth-message').textContent, /Код отправлен/);
  dom.window.document.querySelector('#code').value = '123456';
  dom.window.document.querySelector('#auth-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  assert.match(dom.window.document.body.textContent, /Начать прогулку/);
  dom.window.document.querySelector('[data-tab="settings"]').click();
  assert.match(dom.window.document.body.textContent, /tester@example.com/);
  dom.window.document.querySelector('[data-guide="dana"]').click();
  assert.match(dom.window.document.body.textContent, /Пример голоса/);
  dom.window.document.querySelector('#switch-guide').click();
  assert.match(dom.window.document.querySelector('#guide-profile').textContent, /Arthur/);
  dom.window.document.querySelector('#close-profile').click();
  dom.window.document.querySelector('[data-tab="stories"]').click();
  assert.match(dom.window.document.body.textContent, /Ваша первая прогулка/);
}

async function testAdminDashboard() {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://heycity.example/admin', runScripts: 'dangerously' });
  dom.window.sessionStorage.setItem('heyCityToken', 'admin-token');
  dom.window.sessionStorage.setItem('heyCityUser', JSON.stringify({ id: 'admin', email: 'owner@example.com', role: 'admin' }));
  dom.window.HEY_CITY_CONFIG = { apiUrl: 'https://api.example', googleMapsBrowserKey: '' };
  dom.window.fetch = async (url) => url.includes('/admin/summary')
    ? response({ users: 3, activeUsers: 2, totals: [{ category: 'product', operation: 'object_viewed', quantity: '5', input_tokens: '0', output_tokens: '0', estimated_cost_usd: '0' }] })
    : response({ users: [{ email: 'tester@example.com', last_seen_at: new Date().toISOString(), objects_viewed: 5, tokens: 100, estimated_cost_usd: 0.01 }] });
  dom.window.eval(source);
  await settle();
  assert.match(dom.window.document.body.textContent, /Статистика/);
  assert.match(dom.window.document.body.textContent, /tester@example.com/);
  assert.match(dom.window.document.body.textContent, /Google Maps/);
  assert.ok(dom.window.document.querySelector('#admin-back'));
  assert.ok(dom.window.document.querySelector('#admin-logout'));
  assert.equal(dom.window.document.querySelectorAll('.nav button').length, 3);
  dom.window.document.querySelector('#admin-back').click();
  assert.match(dom.window.document.body.textContent, /Начать прогулку/);
}

async function testMapConfiguration() {
  assert.doesNotMatch(source, /mapId\s*:\s*['"]DEMO_MAP_ID/);
  assert.match(source, /auth_referrer_policy=origin/);
  const css = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.screen\s*\{[^}]*overflow:auto/);
  assert.match(css, /\.profile-content\s*\{[^}]*overflow:auto/);
}

await testLoginAndNavigation();
await testAdminDashboard();
await testMapConfiguration();
console.log('web smoke tests passed');
