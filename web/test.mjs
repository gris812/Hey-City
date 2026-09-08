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
  let stoppedWatches = 0;
  let voiceSampleRequest = null;
  let mapConstructions = 0;
  let mapResizeEvents = 0;
  let dynamicMapUsageEvents = 0;
  let locationCallback = null;
  Object.defineProperty(dom.window.navigator, 'geolocation', { value: {
    watchPosition: (callback) => { locationCallback = callback; return 17; },
    clearWatch: () => { stoppedWatches += 1; },
  } });
  dom.window.HTMLMediaElement.prototype.play = async () => {};
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.google = { maps: {
    Map: class { constructor() { mapConstructions += 1; } setCenter() {} },
    Marker: class { setMap() {} },
    event: { trigger: () => { mapResizeEvents += 1; } },
  } };
  dom.window.HEY_CITY_CONFIG = { apiUrl: 'https://api.example', googleMapsBrowserKey: 'browser-key' };
  dom.window.fetch = async (url, options = {}) => {
    if (url.endsWith('/auth/otp/send')) return response({ ok: true, message: 'OTP sent' });
    if (url.endsWith('/auth/otp/verify')) return response({ token: 'test-token', user: { id: 'u1', email: 'tester@example.com', role: 'user' } });
    if (url.endsWith('/sessions/start')) {
      assert.deepEqual(JSON.parse(options.body || '{}').mode, 'walking');
      assert.equal(JSON.parse(options.body || '{}').autoMode, true);
      return response({ sessionId: 'session-1' });
    }
    if (url.endsWith('/sessions/session-1/context')) {
      const request = JSON.parse(options.body || '{}');
      return response({ nextAction: 'NONE', mode: request.speed >= 15 ? 'vehicle' : 'walking', speedKmh: request.speed, aheadDiscovery: { topCandidates: [] } });
    }
    if (url.endsWith('/stories/voice-sample')) {
      voiceSampleRequest = JSON.parse(options.body || '{}');
      return response({ audioUrl: 'https://api.example/media/dana.mp3', transcriptText: 'Hello' });
    }
    if (url.endsWith('/usage/client')) { dynamicMapUsageEvents += 1; return response({ ok: true }); }
    if (url.endsWith('/sessions/session-1/end')) return response({ ok: true });
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
  assert.match(dom.window.document.body.textContent, /Начать/);
  assert.equal(mapConstructions, 1);
  const originalMapNode = dom.window.document.querySelector('#map');
  assert.equal(dom.window.localStorage.getItem('heyCityToken'), 'test-token');
  assert.match(dom.window.localStorage.getItem('heyCityUser'), /tester@example.com/);
  dom.window.document.querySelector('#start-walk').click();
  await settle();
  assert.equal(dom.window.document.querySelector('#radar-scan').hidden, false);
  await locationCallback({ coords: { latitude: 40.7, longitude: -74, heading: 90, speed: 6, accuracy: 8 } });
  await settle();
  assert.match(dom.window.document.querySelector('#top-status').textContent, /автомобиле/);
  assert.match(dom.window.document.querySelector('.area-label').textContent, /22 км\/ч/);
  dom.window.document.querySelector('[data-tab="settings"]').click();
  assert.equal(stoppedWatches, 0);
  assert.match(dom.window.document.body.textContent, /tester@example.com/);
  dom.window.document.querySelector('[data-tab="map"]').click();
  await settle();
  assert.equal(dom.window.document.querySelector('#map'), originalMapNode);
  assert.equal(mapConstructions, 1);
  assert.equal(dynamicMapUsageEvents, 1);
  assert.ok(mapResizeEvents >= 1);
  assert.equal(dom.window.document.querySelector('#stop-walk').hidden, false);
  assert.match(dom.window.document.body.textContent, /22 км\/ч/);
  dom.window.document.querySelector('#stop-walk').click();
  assert.equal(stoppedWatches, 1);
  dom.window.document.querySelector('[data-tab="settings"]').click();
  await settle();
  dom.window.document.querySelector('[data-guide="dana"]').click();
  assert.match(dom.window.document.body.textContent, /Пример голоса/);
  dom.window.document.querySelector('#voice-sample').click();
  await settle();
  assert.deepEqual(voiceSampleRequest, { voiceId: 'dana', lang: 'ru' });
  dom.window.document.querySelector('#switch-guide').click();
  assert.match(dom.window.document.querySelector('#guide-profile').textContent, /Arthur/);
  dom.window.document.querySelector('#choose-guide').click();
  assert.equal(dom.window.localStorage.getItem('heyCityGuide'), 'arthur');
  dom.window.document.querySelector('[data-language="en"]').click();
  assert.equal(dom.window.localStorage.getItem('heyCityLanguage'), 'en');
  assert.match(dom.window.document.body.textContent, /App language/);
  dom.window.document.querySelector('[data-guide-language="en"]').click();
  assert.equal(dom.window.localStorage.getItem('heyCityGuideLanguage'), 'en');
  dom.window.document.querySelector('[data-tab="stories"]').click();
  assert.match(dom.window.document.body.textContent, /Your first walk starts here/);
}

async function testAdminDashboard() {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://heycity.example/admin', runScripts: 'dangerously' });
  dom.window.HTMLMediaElement.prototype.play = async () => {};
  dom.window.HTMLMediaElement.prototype.pause = () => {};
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
  assert.match(dom.window.document.body.textContent, /Из чего складывается расчёт/);
  assert.match(dom.window.document.body.textContent, /не фактическая сумма счёта/);
  assert.ok(dom.window.document.querySelector('#admin-back'));
  assert.ok(dom.window.document.querySelector('#admin-logout'));
  assert.equal(dom.window.document.querySelectorAll('.nav button').length, 3);
  dom.window.document.querySelector('#admin-back').click();
  assert.match(dom.window.document.body.textContent, /Начать/);
}

async function testMapConfiguration() {
  assert.doesNotMatch(source, /mapId\s*:\s*['"]DEMO_MAP_ID/);
  assert.doesNotMatch(source, /auth_referrer_policy=origin/);
  assert.match(source, /loading=async/);
  const css = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.shell\s*\{[^}]*height:100dvh/);
  assert.match(css, /\.screen\s*\{[^}]*overflow:hidden/);
  assert.match(css, /\.page-view\s*\{[^}]*overflow-y:auto/);
  assert.match(css, /\.settings-sticky\s*\{[^}]*position:sticky/);
  assert.match(css, /\.radar-scan::before\s*\{[^}]*conic-gradient/);
  assert.match(css, /\.profile-content\s*\{[^}]*overflow:auto/);
}

async function testDelayedMapsCallback() {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://heycity.example/', runScripts: 'dangerously' });
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.localStorage.setItem('heyCityToken', 'test-token');
  dom.window.localStorage.setItem('heyCityUser', JSON.stringify({ id: 'test', role: 'user' }));
  dom.window.HEY_CITY_CONFIG = { apiUrl: 'https://api.example', googleMapsBrowserKey: 'test-key' };
  dom.window.fetch = async () => response({});
  dom.window.google = { maps: {} };
  let constructions = 0;
  dom.window.eval(source);
  const script = dom.window.document.querySelector('script');
  assert.equal(new URL(script.src).searchParams.get('callback'), 'heyCityMapsReady');
  script.dispatchEvent(new dom.window.Event('load'));
  await settle();
  assert.equal(constructions, 0);
  assert.equal(dom.window.document.querySelector('#map-failure').hidden, true);
  dom.window.google.maps.Map = class { constructor() { constructions++; } };
  dom.window.heyCityMapsReady();
  await settle();
  assert.equal(constructions, 1);
  assert.equal(dom.window.document.querySelector('#map-failure').hidden, true);
  dom.window.gm_authFailure();
  assert.equal(dom.window.document.querySelector('#map-failure').hidden, false);
  dom.window.close();
}

await testDelayedMapsCallback();
await testLoginAndNavigation();
await testAdminDashboard();
await testMapConfiguration();
console.log('web smoke tests passed');
