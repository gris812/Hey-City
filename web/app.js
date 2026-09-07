const config = window.HEY_CITY_CONFIG || {};
const state = {
  token: sessionStorage.getItem('heyCityToken'),
  user: JSON.parse(sessionStorage.getItem('heyCityUser') || 'null'),
  tab: location.pathname === '/admin' ? 'admin' : 'map',
  sessionId: null, watchId: null, map: null, marker: null, lastPlace: null,
};
const app = document.querySelector('#app');

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
async function api(path, options = {}) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: { 'Content-Type':'application/json', ...(state.token ? { Authorization:`Bearer ${state.token}` } : {}), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function loginView() {
  app.innerHTML = `<section class="login"><div><div class="eyebrow">Полевой доступ · beta</div><h1 class="wordmark">Hey City</h1><p class="intro">Город говорит, пока вы идёте. Войдите по email, чтобы начать прогулку.</p></div>
    <form class="auth-form" id="auth-form"><label for="email">Email</label><input id="email" type="email" autocomplete="email" required placeholder="you@example.com" />
    <div id="code-wrap" hidden><label for="code">Код из письма</label><input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" /></div>
    <button class="primary" type="submit">Получить код</button><p class="message" id="auth-message"></p></form></section>`;
  const form = document.querySelector('#auth-form');
  let sent = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.querySelector('#auth-message');
    const button = form.querySelector('button');
    const email = document.querySelector('#email').value.trim().toLowerCase();
    message.textContent = ''; button.disabled = true;
    try {
      if (!sent) {
        const result = await api('/auth/otp/send', { method:'POST', body:JSON.stringify({ email }) });
        sent = true; document.querySelector('#code-wrap').hidden = false;
        document.querySelector('#code').required = true; button.textContent = 'Войти';
        message.style.color = 'var(--green)'; message.textContent = result.message === 'Enter administrator access code' ? 'Введите код администратора.' : 'Код отправлен. Проверьте почту.';
      } else {
        const result = await api('/auth/otp/verify', { method:'POST', body:JSON.stringify({ email, code:document.querySelector('#code').value }) });
        state.token = result.token; state.user = result.user;
        sessionStorage.setItem('heyCityToken', state.token); sessionStorage.setItem('heyCityUser', JSON.stringify(state.user));
        state.tab = state.user.role === 'admin' && location.pathname === '/admin' ? 'admin' : 'map'; render();
      }
    } catch (error) { message.style.color = '#a13e2c'; message.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

function shell(content, active = state.tab) {
  app.innerHTML = `<div class="shell"><section class="screen">${content}</section><nav class="nav" aria-label="Основная навигация">
    <button data-tab="map" class="${active==='map'?'active':''}">Карта</button><button data-tab="stories" class="${active==='stories'?'active':''}">Истории</button><button data-tab="settings" class="${active==='settings'?'active':''}">Настройки</button></nav></div>`;
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { stopWalking(); state.tab = button.dataset.tab; render(); }));
}

function mapView() {
  shell(`<div id="map" class="map"><div class="map-state" id="map-state">Разрешите доступ к геопозиции, чтобы услышать город.</div></div>
    <header class="topbar"><div class="brand">Hey City · Walking</div><button class="locate" id="locate" aria-label="Найти меня">◎</button></header>
    <article class="place-sheet"><div class="eyebrow" id="walk-status">Готов к прогулке</div><h1 id="place-title">Что рядом?</h1><p id="place-copy">Карта найдёт интересное место и предложит рассказ — без записи непрерывного маршрута.</p>
    <div class="sheet-actions"><button class="primary" id="start-walk">Начать прогулку</button><button class="secondary" id="stop-walk" hidden>Стоп</button></div></article>`, 'map');
  document.querySelector('#start-walk').addEventListener('click', startWalking);
  document.querySelector('#stop-walk').addEventListener('click', stopWalking);
  document.querySelector('#locate').addEventListener('click', startWalking);
  void loadMap();
}

async function loadMap() {
  if (!config.googleMapsBrowserKey) return;
  if (!window.google?.maps) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsBrowserKey)}&v=weekly`;
      script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
  }
  state.map = new google.maps.Map(document.querySelector('#map'), { center:{lat:40.7128,lng:-74.006}, zoom:15, disableDefaultUI:true, clickableIcons:false, mapId:'DEMO_MAP_ID' });
  api('/usage/client', { method:'POST', body:JSON.stringify({ operation:'dynamic_map_load' }) }).catch(() => {});
}

async function startWalking() {
  const status = document.querySelector('#walk-status');
  if (!navigator.geolocation) { status.textContent = 'Геопозиция не поддерживается'; return; }
  try {
    if (!state.sessionId) {
      const result = await api('/sessions/start', { method:'POST', body:JSON.stringify({ themeTags:['mixed'], narrationStyle:'documentary', lengthSec:90, leadTimeMin:2, voiceId:'dana', language:'ru', autoplay:true }) });
      state.sessionId = result.sessionId;
    }
    document.querySelector('#start-walk').hidden = true; document.querySelector('#stop-walk').hidden = false;
    status.textContent = 'Ищу место поблизости';
    state.watchId = navigator.geolocation.watchPosition(updateLocation, (error) => { status.textContent = error.code === 1 ? 'Нужен доступ к геопозиции' : 'Не удалось определить позицию'; }, { enableHighAccuracy:true, maximumAge:4000, timeout:12000 });
  } catch (error) { status.textContent = error.message; }
}

async function updateLocation(position) {
  const { latitude:lat, longitude:lng, heading, speed, accuracy } = position.coords;
  const point = { lat, lng }; state.map?.setCenter(point);
  if (state.map) { state.marker?.setMap(null); state.marker = new google.maps.Marker({ map:state.map, position:point }); }
  try {
    const result = await api(`/sessions/${state.sessionId}/context`, { method:'POST', body:JSON.stringify({ lat,lng,heading:heading ?? 0,speed:(speed ?? 1.2)*3.6,accuracyMeters:accuracy,timestamp:Date.now() }) });
    document.querySelector('#walk-status').textContent = result.nextAction === 'PLAY' ? 'Dana рассказывает' : 'Слушаю город';
    const title = result.poi?.name || result.target?.name || result.decision?.poiName;
    if (title) document.querySelector('#place-title').textContent = title;
    if (result.transcriptText) document.querySelector('#place-copy').textContent = result.transcriptText;
    if (result.audioUrl && result.nextAction === 'PLAY') new Audio(result.audioUrl).play().catch(() => {});
  } catch (error) { document.querySelector('#walk-status').textContent = error.message; }
}

async function stopWalking() {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
  if (state.sessionId) api(`/sessions/${state.sessionId}/end`, { method:'POST', body:'{}' }).catch(() => {});
  state.sessionId = null;
}

function storiesView() { shell(`<div class="page"><div class="eyebrow">Личный архив</div><h1>Истории</h1><div class="empty">Прослушанные места появятся здесь после первой прогулки.</div></div>`, 'stories'); }
function settingsView() { shell(`<div class="page"><div class="eyebrow">Профиль</div><h1>Настройки</h1>
  <div class="settings-row"><strong>Аккаунт</strong><p>${esc(state.user?.email)}</p></div><div class="settings-row"><strong>Приватность</strong><p>Без непрерывной записи маршрута. События использования и просмотренные объекты — для внутренней статистики.</p></div>
  ${state.user?.role==='admin'?'<div class="settings-row"><strong>Администрирование</strong><p><button class="secondary" id="open-admin">Открыть статистику</button></p></div>':''}
  <div class="settings-row"><strong>Сессия</strong><p><button class="secondary" id="logout">Выйти</button></p></div></div>`, 'settings');
  document.querySelector('#logout').addEventListener('click', () => { sessionStorage.clear(); state.token=null; state.user=null; render(); });
  document.querySelector('#open-admin')?.addEventListener('click', () => { history.pushState({},'', '/admin'); state.tab='admin'; render(); });
}

async function adminView() {
  if (state.user?.role !== 'admin') { settingsView(); return; }
  app.innerHTML = `<div class="page"><div class="admin-head"><div><div class="eyebrow">Hey City · operations</div><h1>Статистика</h1></div><select class="period" id="period"><option value="7">7 дней</option><option value="30" selected>30 дней</option><option value="90">90 дней</option></select></div><div id="admin-data" class="empty">Загрузка…</div></div>`;
  document.querySelector('#period').addEventListener('change', loadAdmin);
  await loadAdmin();
}
async function loadAdmin() {
  const node = document.querySelector('#admin-data');
  try {
    const days = document.querySelector('#period')?.value || 30;
    const [summary, list] = await Promise.all([api(`/admin/summary?days=${days}`), api('/admin/users')]);
    const totals = summary.totals || [];
    const value = (category, field='quantity', operation) => totals.filter((x)=>x.category===category && (!operation || x.operation===operation)).reduce((n,x)=>n+Number(x[field]||0),0);
    const cost = totals.reduce((n,x)=>n+Number(x.estimated_cost_usd||0),0);
    const tokens = value('openai_text','input_tokens') + value('openai_text','output_tokens') + value('openai_tts','input_tokens') + value('openai_tts','output_tokens');
    const googleCost = value('google_maps','estimated_cost_usd');
    node.className=''; node.innerHTML = `<section class="metrics"><div class="metric"><b>${summary.users}</b><span>пользователи</span></div><div class="metric"><b>${summary.activeUsers}</b><span>активные</span></div><div class="metric"><b>${value('product','quantity','object_viewed')}</b><span>объекты</span></div><div class="metric"><b>${tokens}</b><span>OpenAI токены*</span></div><div class="metric"><b>$${googleCost.toFixed(2)}</b><span>Google Maps</span></div><div class="metric"><b>$${cost.toFixed(2)}</b><span>общий расход</span></div></section>
      <div class="table-wrap"><table><thead><tr><th>Email</th><th>Последняя сессия</th><th>Объекты</th><th>Токены</th><th>Расход</th></tr></thead><tbody>${list.users.map((u)=>`<tr><td>${esc(u.email)}</td><td>${new Date(u.last_seen_at).toLocaleString('ru')}</td><td>${u.objects_viewed}</td><td>${u.tokens}</td><td>$${Number(u.estimated_cost_usd).toFixed(4)}</td></tr>`).join('')}</tbody></table></div><p class="empty">* TTS-токены и стоимость — внутренняя оценка до применения месячных бесплатных квот и объёмных скидок.</p>`;
  } catch (error) { node.className='message'; node.textContent=error.message; }
}

function render() {
  if (!state.token) return loginView();
  if (state.tab === 'admin') return void adminView();
  if (state.tab === 'stories') return storiesView();
  if (state.tab === 'settings') return settingsView();
  return mapView();
}
window.addEventListener('popstate', () => { state.tab = location.pathname === '/admin' ? 'admin' : 'map'; render(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js');
render();
