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
  let markerConstructions = 0;
  let markerMoves = 0;
  let contextCalls = 0;
  let center = null;
  Object.defineProperty(dom.window.navigator, 'geolocation', { value: {
    getCurrentPosition: (success) => success({ coords: { latitude: 42.1, longitude: -88.3, heading: 90, speed: 6, accuracy: 8 } }),
    watchPosition: (callback) => { locationCallback = callback; return 17; },
    clearWatch: () => { stoppedWatches += 1; },
  } });
  dom.window.HTMLMediaElement.prototype.play = async () => {};
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.google = { maps: {
    Map: class { constructor() { mapConstructions += 1; } setCenter(point) { center = point; } },
    Marker: class { constructor() { markerConstructions++; } setMap() {} setPosition() { markerMoves++; } },
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
      if (contextCalls++ === 0) assert.equal(dom.window.document.querySelector('#radar-scan').hidden, false, 'radar scans at actual GPS position during initial request');
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
  assert.equal(center.lat, 42.1, 'GPS preview works before starting a server session');
  assert.equal(contextCalls, 0, 'preview does not trigger paid discovery');
  const originalMapNode = dom.window.document.querySelector('#map');
  assert.equal(dom.window.localStorage.getItem('heyCityToken'), 'test-token');
  assert.match(dom.window.localStorage.getItem('heyCityUser'), /tester@example.com/);
  dom.window.document.querySelector('#start-walk').click();
  await settle();
  assert.equal(dom.window.document.querySelector('#radar-scan').hidden, true);
  assert.match(dom.window.document.querySelector('#open-guide img').src, /dana-v3-avatar.png$/);
  const firstFix = locationCallback({ coords: { latitude: 40.7, longitude: -74, heading: 90, speed: 6, accuracy: 8 } });
  await locationCallback({ coords: { latitude: 40.7001, longitude: -74, heading: 90, speed: 6, accuracy: 8 } });
  await firstFix;
  await settle();
  assert.match(dom.window.document.querySelector('#top-status').textContent, /автомобиле/);
  assert.match(dom.window.document.querySelector('.area-label').textContent, /22 км\/ч/);
  assert.equal(markerConstructions, 1);
  assert.equal(markerConstructions, 1, 'GPS does not recreate marker');
  assert.ok(markerMoves >= 1);
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

async function testLocationRecovery() {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://heycity.example/', runScripts: 'dangerously' });
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.localStorage.setItem('heyCityToken', 'test');
  dom.window.localStorage.setItem('heyCityUser', JSON.stringify({ id: 'test', role: 'user' }));
  dom.window.HEY_CITY_CONFIG = { apiUrl: 'https://api.example', googleMapsBrowserKey: 'test' };
  let failGps = true, failSession = true, starts = 0, contexts = 0, watches = 0, watchError, center;
  const fix = { coords: { latitude: 42.1, longitude: -88.3, heading: null, speed: 0, accuracy: 10 } };
  Object.defineProperty(dom.window.navigator, 'geolocation', { value: {
    getCurrentPosition: (ok, fail) => failGps ? fail({ code: 1 }) : ok(fix),
    watchPosition: (ok, fail) => { watchError = fail; return ++watches; },
    clearWatch: () => {},
  } });
  dom.window.google = { maps: {
    Map: class { setCenter(p) { center = p; } }, Marker: class { setPosition() {} }, event: { trigger() {} },
  } };
  dom.window.fetch = async (url, options) => {
    if (url.endsWith('/sessions/start')) { starts++; return failSession ? response({ error: 'Invalid or expired token' }, false) : response({ sessionId: 's' }); }
    if (url.endsWith('/context')) {
      contexts++;
      assert.equal(JSON.parse(options.body).lat, 42.1, 'discovery uses actual fix');
      return response({ nextAction: 'NONE', aheadDiscovery: { providerRefresh: { errorCode: 'http_403' }, topCandidates: [] } });
    }
    return response({});
  };
  dom.window.eval(source);
  await settle();
  assert.equal(starts, 0);
  failGps = false;
  dom.window.document.querySelector('#locate').click();
  await settle();
  assert.equal(center.lat, 42.1, 'retry recenters without API session');
  dom.window.document.querySelector('#start-walk').click();
  await settle();
  assert.equal(watches, 0);
  assert.equal(dom.window.document.querySelector('#start-walk').hidden, false, 'API failure leaves retry available');
  failSession = false;
  dom.window.document.querySelector('#start-walk').click();
  dom.window.document.querySelector('#start-walk').click();
  await settle();
  assert.equal(starts, 2, 'double click does not create duplicate sessions');
  assert.equal(contexts, 1);
  assert.match(dom.window.document.querySelector('#walk-status').textContent, /Поиск объектов недоступен/);
  watchError({ code: 3 });
  assert.equal(dom.window.document.querySelector('#start-walk').hidden, false, 'GPS timeout releases watch');
  dom.window.document.querySelector('#start-walk').click();
  await settle();
  assert.equal(watches, 2, 'watch can restart after timeout');
  assert.equal(contexts, 2);
  dom.window.close();
}

await testLocationRecovery();
await testDelayedMapsCallback();
await testLoginAndNavigation();
await testAdminDashboard();
await testMapConfiguration();
console.log('web smoke tests passed');
