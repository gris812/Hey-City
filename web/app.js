const config = window.HEY_CITY_CONFIG || {};
const persistedToken = localStorage.getItem('heyCityToken') || sessionStorage.getItem('heyCityToken');
const storedUser = localStorage.getItem('heyCityUser') || sessionStorage.getItem('heyCityUser');
const state = {
  token: persistedToken,
  user: storedUser ? JSON.parse(storedUser) : null,
  tab: location.pathname === '/admin' ? 'admin' : 'map',
  sessionId: null, watchId: null, map: null, marker: null, profile: null,
  lastPoint: null, lastResult: null, walkStatus: 'Готов к прогулке',
  guide: localStorage.getItem('heyCityGuide') || 'dana',
  appLanguage: localStorage.getItem('heyCityLanguage') || 'ru',
};
if (state.token && state.user) {
  localStorage.setItem('heyCityToken', state.token);
  localStorage.setItem('heyCityUser', JSON.stringify(state.user));
  sessionStorage.removeItem('heyCityToken');
  sessionStorage.removeItem('heyCityUser');
}
const app = document.querySelector('#app');
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

const guides = {
  dana: { name: 'Dana', role: 'Городской проводник', image: '/assets/dana.webp', body: 'Живая, наблюдательная и любопытная. Dana замечает характер города, локальную жизнь и детали, мимо которых легко пройти.', interests: ['Скрытые места', 'Локальная жизнь', 'Атмосфера'], greeting: 'Привет! Я Dana. Будем идти в вашем ритме — я заговорю, когда рядом появится место, которое действительно стоит заметить.' },
  arthur: { name: 'Arthur', role: 'Историк', image: '/assets/arthur.webp', body: 'Структурный, точный и внимательный. Arthur объясняет город через историю, архитектуру и решения людей.', interests: ['История', 'Архитектура', 'Контекст'], greeting: 'Здравствуйте. Я Arthur. Вместе мы увидим, как история, архитектура и человеческие решения сформировали город вокруг нас.' },
};

async function api(path, options = {}) {
  const response = await fetch(`${config.apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function icon(name) {
  const paths = {
    map: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    stories: '<path d="M4 5.5h16v13H4z"/><path d="M8 9h8M8 13h6"/>',
    settings: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    locate: '<circle cx="12" cy="12" r="6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    back: '<path d="m15 5-7 7 7 7"/>', play: '<path d="m9 7 8 5-8 5z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function setPath(path) { if (location.pathname !== path) history.pushState({}, '', path); }
function navigate(tab) { state.tab = tab; setPath(tab === 'admin' ? '/admin' : '/'); render(); }
function logout() { stopWalking(false); localStorage.removeItem('heyCityToken'); localStorage.removeItem('heyCityUser'); sessionStorage.removeItem('heyCityToken'); sessionStorage.removeItem('heyCityUser'); state.token = null; state.user = null; state.profile = null; state.tab = 'map'; setPath('/'); render(); }

function loginView() {
  const adminLogin = location.pathname === '/admin';
  app.innerHTML = `<section class="login"><div class="login-intro"><div class="eyebrow">${adminLogin ? 'Служебный доступ' : 'Полевой доступ · beta'}</div><h1 class="wordmark">Hey<br>City</h1><p class="intro">${adminLogin ? 'Войдите с административным email и отдельным кодом.' : 'Город говорит, пока вы идёте. Выберите гида и начните прогулку.'}</p></div>
    <form class="auth-form" id="auth-form"><label for="email">Email</label><input id="email" type="email" autocomplete="email" required placeholder="you@example.com"><div id="code-wrap" hidden><label for="code">Код доступа</label><input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000"></div><button class="primary" type="submit">Получить код</button><p class="message" id="auth-message"></p></form></section>`;
  const form = document.querySelector('#auth-form');
  let sent = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.querySelector('#auth-message'); const button = form.querySelector('button'); const email = document.querySelector('#email').value.trim().toLowerCase();
    message.textContent = ''; button.disabled = true;
    try {
      if (!sent) {
        const result = await api('/auth/otp/send', { method: 'POST', body: JSON.stringify({ email }) });
        sent = true; document.querySelector('#code-wrap').hidden = false; document.querySelector('#code').required = true; document.querySelector('#code').focus(); button.textContent = 'Войти'; message.dataset.tone = 'success'; message.textContent = result.message === 'Enter administrator access code' ? 'Введите код администратора.' : 'Код отправлен. Проверьте почту.';
      } else {
        const result = await api('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email, code: document.querySelector('#code').value }) });
        state.token = result.token; state.user = result.user; localStorage.setItem('heyCityToken', state.token); localStorage.setItem('heyCityUser', JSON.stringify(state.user)); state.tab = state.user.role === 'admin' && location.pathname === '/admin' ? 'admin' : 'map'; render();
      }
    } catch (error) { message.dataset.tone = 'error'; message.textContent = error.message; } finally { button.disabled = false; }
  });
}

function shell(content, active = state.tab) {
  state.map = null;
  state.marker = null;
  app.innerHTML = `<div class="shell"><section class="screen">${content}</section><nav class="nav" aria-label="Основная навигация"><button data-tab="map" class="${active === 'map' ? 'active' : ''}">${icon('map')}<span>Карта</span></button><button data-tab="stories" class="${active === 'stories' ? 'active' : ''}">${icon('stories')}<span>Истории</span></button><button data-tab="settings" class="${active === 'settings' ? 'active' : ''}">${icon('settings')}<span>Настройки</span></button></nav></div>`;
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.tab)));
}

function mapView() {
  const guide = guides[state.guide];
  const walking = state.watchId !== null;
  const lastTitle = state.lastResult?.poi?.name || state.lastResult?.target?.name || state.lastResult?.decision?.poiName;
  const lastCopy = state.lastResult?.transcriptText;
  shell(`<div id="map" class="map"><div class="map-state" id="map-state">Подключаю карту…</div></div><div class="map-shade" aria-hidden="true"></div>
    <header class="map-header"><button class="icon-button" id="open-menu" aria-label="Открыть настройки">${icon('menu')}</button><div class="walking-status ${walking ? 'is-live' : ''}"><i></i><span id="top-status">${walking ? 'Слушаю город' : 'Пешеходный режим'}</span></div><button class="guide-avatar" id="open-guide" aria-label="Открыть профиль ${guide.name}"><img src="${guide.image}" alt=""></button></header>
    <button class="map-locate" id="locate" aria-label="Показать моё местоположение">${icon('locate')}</button>
    <article class="walking-sheet"><div class="sheet-handle"></div><div class="sheet-kicker"><span id="walk-status">${esc(state.walkStatus)}</span><span class="area-label">${walking ? 'GPS активен' : 'Рядом с вами'}</span></div><div class="ambient-row"><img class="ambient-avatar" src="${guide.image}" alt="${guide.name}"><div><h1 id="place-title">${esc(lastTitle || 'Слушаю город')}</h1><p id="place-copy">${esc(lastCopy || `${guide.name} заговорит, когда рядом появится место, которое действительно стоит заметить.`)}</p></div></div><div class="sheet-actions"><button class="primary" id="start-walk" ${walking ? 'hidden' : ''}>Начать прогулку</button><button class="secondary" id="stop-walk" ${walking ? '' : 'hidden'}>Завершить</button></div></article>`, 'map');
  document.querySelector('#start-walk').addEventListener('click', startWalking); document.querySelector('#stop-walk').addEventListener('click', stopWalking); document.querySelector('#locate').addEventListener('click', startWalking); document.querySelector('#open-menu').addEventListener('click', () => navigate('settings')); document.querySelector('#open-guide').addEventListener('click', () => openGuideProfile(state.guide)); void loadMap();
}

async function loadMap() {
  const status = document.querySelector('#map-state');
  if (!config.googleMapsBrowserKey) { if (status) status.textContent = 'Ключ карты не настроен'; return; }
  window.gm_authFailure = () => { const node = document.querySelector('#map-state'); if (node) { node.hidden = false; node.textContent = 'Google Maps отклонил browser key. Проверьте HTTP referrer для heycity.stolbergco.com.'; } };
  try {
    if (!window.google?.maps) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsBrowserKey)}&v=weekly&auth_referrer_policy=origin`; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
    const mapNode = document.querySelector('#map'); if (!mapNode) return;
    state.map = new google.maps.Map(mapNode, { center: state.lastPoint || { lat: 40.7128, lng: -74.006 }, zoom: 15, disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy' });
    if (state.lastPoint) state.marker = new google.maps.Marker({ map: state.map, position: state.lastPoint });
    document.querySelector('#map-state')?.setAttribute('hidden', ''); api('/usage/client', { method: 'POST', body: JSON.stringify({ operation: 'dynamic_map_load' }) }).catch(() => {});
  } catch { if (status) status.textContent = 'Не удалось загрузить карту. Повторите позже.'; }
}

async function startWalking() {
  const status = document.querySelector('#walk-status');
  if (!navigator.geolocation) { status.textContent = 'Геопозиция не поддерживается'; return; }
  try {
    if (!state.sessionId) { const result = await api('/sessions/start', { method: 'POST', body: JSON.stringify({ themeTags: ['mixed'], narrationStyle: 'documentary', lengthSec: 90, leadTimeMin: 2, voiceId: state.guide === 'arthur' ? 'artur' : 'dana', language: state.appLanguage, autoplay: true }) }); state.sessionId = result.sessionId; }
    state.walkStatus = 'Ищу интересное рядом'; document.querySelector('#start-walk').hidden = true; document.querySelector('#stop-walk').hidden = false; status.textContent = state.walkStatus; document.querySelector('#top-status').textContent = 'Слушаю город';
    state.watchId = navigator.geolocation.watchPosition(updateLocation, (error) => { status.textContent = error.code === 1 ? 'Разрешите доступ к геопозиции' : 'Не удалось определить позицию'; }, { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 });
  } catch (error) { status.textContent = error.message; }
}

async function updateLocation(position) {
  const { latitude: lat, longitude: lng, heading, speed, accuracy } = position.coords; const point = { lat, lng }; state.lastPoint = point; state.map?.setCenter(point);
  if (state.map) { state.marker?.setMap(null); state.marker = new google.maps.Marker({ map: state.map, position: point }); }
  try {
    const result = await api(`/sessions/${state.sessionId}/context`, { method: 'POST', body: JSON.stringify({ lat, lng, heading: heading ?? 0, speed: (speed ?? 1.2) * 3.6, accuracyMeters: accuracy, timestamp: Date.now() }) });
    state.lastResult = result; state.walkStatus = result.nextAction === 'PLAY' ? `${guides[state.guide].name} рассказывает` : 'Слушаю город';
    const title = result.poi?.name || result.target?.name || result.decision?.poiName; const statusNode = document.querySelector('#walk-status'); const titleNode = document.querySelector('#place-title'); const copyNode = document.querySelector('#place-copy'); if (statusNode) statusNode.textContent = state.walkStatus; if (title && titleNode) titleNode.textContent = title; if (result.transcriptText && copyNode) copyNode.textContent = result.transcriptText; if (result.audioUrl && result.nextAction === 'PLAY') new Audio(result.audioUrl).play().catch(() => {});
  } catch (error) { state.walkStatus = error.message; const statusNode = document.querySelector('#walk-status'); if (statusNode) statusNode.textContent = state.walkStatus; }
}

function stopWalking(refresh = true) { if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId); state.watchId = null; if (state.sessionId) api(`/sessions/${state.sessionId}/end`, { method: 'POST', body: '{}' }).catch(() => {}); state.sessionId = null; state.walkStatus = 'Готов к прогулке'; if (refresh && state.tab === 'map') render(); }

function storiesView() {
  const historyItems = state.profile?.history || [];
  shell(`<div class="page stories-page"><div class="page-heading"><div><div class="eyebrow">Личный архив</div><h1>Истории</h1></div><span class="count">${historyItems.length} прогулок</span></div>${historyItems.length ? `<div class="story-list">${historyItems.map((item, index) => `<article class="story-item"><div class="story-index">${String(index + 1).padStart(2, '0')}</div><div><strong>${esc(item.placeId || 'Городская история')}</strong><p>${new Date(item.completedAt || item.timestamp).toLocaleDateString('ru')}</p></div></article>`).join('')}</div>` : `<div class="story-empty"><div class="story-photo"><img src="/assets/trinity-church.webp" alt="Городская улица"><span>Будущий маршрут</span></div><h2>Ваша первая прогулка начнётся здесь</h2><p>Прослушанные места и завершённые маршруты будут собраны в личную историю города.</p><button class="primary" id="first-walk">Начать прогулку</button></div>`}</div>`, 'stories');
  document.querySelector('#first-walk')?.addEventListener('click', () => navigate('map')); if (!state.profile) loadProfileAndRefresh('stories');
}

function settingsView() {
  const selected = guides[state.guide];
  shell(`<div class="page settings-page"><div class="eyebrow">Профиль</div><h1>Настройки</h1><section class="settings-section account-line"><div><span class="section-label">Аккаунт</span><strong>${esc(state.user?.email)}</strong></div><button class="text-button" id="logout">Выйти</button></section>
    <section class="settings-section"><div class="section-head"><div><span class="section-label">Гид</span><h2>${selected.name} ведёт прогулку</h2></div><span class="section-note">Нажмите для полного профиля</span></div><div class="guide-grid">${Object.entries(guides).map(([id, guide]) => `<button class="guide-card ${state.guide === id ? 'selected' : ''}" data-guide="${id}"><img src="${guide.image}" alt="${guide.name}"><span><strong>${guide.name}</strong><small>${guide.role}</small></span></button>`).join('')}</div></section>
    <section class="settings-section settings-table"><div><span class="section-label">Язык приложения</span><div class="segmented"><button data-language="ru" class="${state.appLanguage === 'ru' ? 'selected' : ''}">Русский</button><button data-language="en" class="${state.appLanguage === 'en' ? 'selected' : ''}">English</button></div></div><div><span class="section-label">История и приватность</span><p>${state.profile?.historyEnabled === false ? 'История отключена' : 'Сохранять просмотренные объекты и прогулки'}</p></div></section>
    ${state.user?.role === 'admin' ? '<section class="settings-section account-line"><div><span class="section-label">Администрирование</span><strong>Статистика полевого теста</strong></div><button class="text-button" id="open-admin">Открыть →</button></section>' : ''}<footer class="settings-footer">Hey City WebApp · beta</footer></div>`, 'settings');
  document.querySelector('#logout').addEventListener('click', logout); document.querySelector('#open-admin')?.addEventListener('click', () => navigate('admin')); document.querySelectorAll('[data-guide]').forEach((button) => button.addEventListener('click', () => openGuideProfile(button.dataset.guide))); document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => { state.appLanguage = button.dataset.language; localStorage.setItem('heyCityLanguage', state.appLanguage); settingsView(); })); if (!state.profile) loadProfileAndRefresh('settings');
}

async function loadProfileAndRefresh(view) { try { state.profile = await api('/me'); } catch { state.profile = { history: [], historyEnabled: true }; } if (state.tab === view) render(); }

function openGuideProfile(initialGuide) {
  let activeGuide = initialGuide;
  const draw = () => {
    document.querySelector('#guide-profile')?.remove(); const guide = guides[activeGuide];
    document.body.insertAdjacentHTML('beforeend', `<div class="guide-profile" id="guide-profile" role="dialog" aria-modal="true" aria-label="Профиль ${guide.name}"><div class="profile-photo"><img src="${guide.image}" alt="${guide.name}"><button class="profile-back" id="close-profile" aria-label="Назад">${icon('back')}</button><span class="swipe-hint">Свайпните для другого гида</span></div><div class="profile-content"><div class="profile-title"><div><h1>${guide.name}</h1><span>${guide.role}</span></div><code>${activeGuide === 'dana' ? '01' : '02'} / 02</code></div><p>${guide.body}</p><div class="interest-line">${guide.interests.join(' · ')}</div><button class="voice-sample" id="voice-sample">${icon('play')}<span><strong>Пример голоса</strong><small>Текстовая заглушка до подключения аудио</small></span></button><blockquote id="voice-copy" hidden>${guide.greeting}</blockquote><div class="profile-actions"><button class="primary" id="choose-guide">Выбрать ${guide.name}</button><button class="text-button" id="switch-guide">Другой гид →</button></div></div></div>`);
    document.querySelector('#close-profile').addEventListener('click', closeGuideProfile); document.querySelector('#voice-sample').addEventListener('click', () => { const copy = document.querySelector('#voice-copy'); copy.hidden = !copy.hidden; }); document.querySelector('#switch-guide').addEventListener('click', () => { activeGuide = activeGuide === 'dana' ? 'arthur' : 'dana'; draw(); }); document.querySelector('#choose-guide').addEventListener('click', () => { state.guide = activeGuide; localStorage.setItem('heyCityGuide', activeGuide); closeGuideProfile(); render(); });
    let startX = null; const modal = document.querySelector('#guide-profile'); modal.addEventListener('touchstart', (event) => { startX = event.touches[0].clientX; }, { passive: true }); modal.addEventListener('touchend', (event) => { if (startX !== null && Math.abs(event.changedTouches[0].clientX - startX) > 60) { activeGuide = activeGuide === 'dana' ? 'arthur' : 'dana'; draw(); } }, { passive: true });
  };
  draw();
}

function closeGuideProfile() { document.querySelector('#guide-profile')?.remove(); }

async function adminView() {
  if (state.user?.role !== 'admin') { navigate('settings'); return; }
  shell(`<div class="page admin-page"><header class="admin-head"><div><div class="eyebrow">Hey City · operations</div><h1>Статистика</h1></div><div class="admin-actions"><button class="text-button" id="admin-back">← В приложение</button><button class="text-button" id="admin-logout">Выйти</button><select class="period" id="period"><option value="7">7 дней</option><option value="30" selected>30 дней</option><option value="90">90 дней</option></select></div></header><div id="admin-data" class="empty">Загрузка…</div></div>`, '');
  document.querySelector('#admin-back').addEventListener('click', () => navigate('map')); document.querySelector('#admin-logout').addEventListener('click', logout); document.querySelector('#period').addEventListener('change', loadAdmin); await loadAdmin();
}

async function loadAdmin() {
  const node = document.querySelector('#admin-data'); if (!node) return;
  try {
    const days = document.querySelector('#period')?.value || 30; const [summary, list] = await Promise.all([api(`/admin/summary?days=${days}`), api('/admin/users')]); const totals = summary.totals || []; const value = (category, field = 'quantity', operation) => totals.filter((item) => item.category === category && (!operation || item.operation === operation)).reduce((sum, item) => sum + Number(item[field] || 0), 0); const cost = totals.reduce((sum, item) => sum + Number(item.estimated_cost_usd || 0), 0); const tokens = value('openai_text', 'input_tokens') + value('openai_text', 'output_tokens') + value('openai_tts', 'input_tokens') + value('openai_tts', 'output_tokens'); const googleCost = value('google_maps', 'estimated_cost_usd');
    node.className = ''; node.innerHTML = `<section class="metrics"><div class="metric"><b>${summary.users}</b><span>пользователи</span></div><div class="metric"><b>${summary.activeUsers}</b><span>активные</span></div><div class="metric"><b>${value('product', 'quantity', 'object_viewed')}</b><span>объекты</span></div><div class="metric"><b>${tokens}</b><span>OpenAI tokens</span></div><div class="metric"><b>$${googleCost.toFixed(2)}</b><span>Google Maps</span></div><div class="metric"><b>$${cost.toFixed(2)}</b><span>общий расход</span></div></section><div class="table-wrap"><table><thead><tr><th>Email</th><th>Последняя сессия</th><th>Объекты</th><th>Токены</th><th>Расход</th></tr></thead><tbody>${list.users.map((user) => `<tr><td>${esc(user.email)}</td><td>${new Date(user.last_seen_at).toLocaleString('ru')}</td><td>${user.objects_viewed}</td><td>${user.tokens}</td><td>$${Number(user.estimated_cost_usd).toFixed(4)}</td></tr>`).join('')}</tbody></table></div><p class="footnote">Расходы являются внутренней расчётной оценкой до бесплатных квот и скидок.</p>`;
  } catch (error) { node.className = 'message'; node.textContent = error.message; }
}

function render() { closeGuideProfile(); if (!state.token) return loginView(); if (state.tab === 'admin') return void adminView(); if (state.tab === 'stories') return storiesView(); if (state.tab === 'settings') return settingsView(); return mapView(); }
window.addEventListener('popstate', () => { state.tab = location.pathname === '/admin' ? 'admin' : 'map'; render(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js');
render();
