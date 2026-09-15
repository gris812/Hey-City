const config = window.HEY_CITY_CONFIG || {};
const persistedToken = localStorage.getItem('heyCityToken') || sessionStorage.getItem('heyCityToken');
const storedUser = localStorage.getItem('heyCityUser') || sessionStorage.getItem('heyCityUser');
const state = {
  token: persistedToken,
  user: storedUser ? JSON.parse(storedUser) : null,
  tab: location.pathname === '/admin' ? 'admin' : 'map',
  sessionId: null, watchId: null, map: null, mapLoadPromise: null, marker: null, candidateMarkers: [], profile: null, audioUrl: null,
  contextInFlight: false, initialScanComplete: false, starting: false, locationPromise: null, runId: 0,
  followPosition: true, selectingPlace: false, selectionRevision:0, selectedPoi:null, selectionStatus:'', lastPoint: null, lastResult: null, walkStatus: '', movementMode: 'walking', speedKmh: null,
  guide: localStorage.getItem('heyCityGuide') || 'dana',
  appLanguage: localStorage.getItem('heyCityLanguage') || 'ru',
  guideLanguage: localStorage.getItem('heyCityGuideLanguage') || 'ru',
  units: localStorage.getItem('heyCityUnits') || 'km', mapOrientation: 'course', heading: null, previousFix: null, lastPosition: null, lastContextAt: 0,
};
if (state.token && state.user) {
  localStorage.setItem('heyCityToken', state.token);
  localStorage.setItem('heyCityUser', JSON.stringify(state.user));
  sessionStorage.removeItem('heyCityToken');
  sessionStorage.removeItem('heyCityUser');
}
const app = document.querySelector('#app');
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

const messages = {
  ru: {
    'nav.map': 'Карта', 'nav.stories': 'Истории', 'nav.settings': 'Настройки',
    'login.field': 'Полевой доступ · beta', 'login.admin': 'Служебный доступ', 'login.copy': 'Город говорит, пока вы идёте. Выберите гида и начните прогулку.', 'login.adminCopy': 'Войдите с административным email и отдельным кодом.', 'login.code': 'Код доступа', 'login.send': 'Получить код', 'login.enter': 'Войти', 'login.sent': 'Код отправлен. Проверьте почту.', 'login.adminCode': 'Введите код администратора.',
    'map.mode': 'Авторежим', 'map.modeWalking': 'Пешком', 'map.modeVehicle': 'В автомобиле', 'map.listening': 'Слушаю город', 'map.ready': 'Готов к маршруту', 'map.searching': 'Сканирую пространство', 'map.nearby': 'Рядом с вами', 'map.gps': 'GPS активен', 'map.speed': '{speed} км/ч', 'map.start': 'Начать', 'map.stop': 'Завершить', 'map.copy': '{guide} заговорит, когда рядом появится место, которое действительно стоит заметить.', 'map.play': 'Слушать рассказ', 'map.pause': 'Пауза', 'map.tapPlay': 'Рассказ готов — нажмите «Слушать»', 'map.connecting': 'Подключаю карту…', 'map.locate': 'Показать моё местоположение', 'map.keyMissing': 'Ключ карты не настроен', 'map.keyRejected': 'Google Maps отклонил ключ для этого домена.', 'map.loadFailed': 'Не удалось загрузить карту. Повторите позже.', 'map.geoUnsupported': 'Геопозиция не поддерживается', 'map.geoPermission': 'Разрешите доступ к геопозиции', 'map.geoFailed': 'Не удалось определить позицию', 'map.speaking': '{guide} · аудио',
    'stories.eyebrow': 'Личный архив', 'stories.title': 'Истории', 'stories.count': '{count} прогулок', 'stories.future': 'Будущий маршрут', 'stories.emptyTitle': 'Ваша первая прогулка начнётся здесь', 'stories.emptyCopy': 'Прослушанные места и завершённые маршруты будут собраны в личную историю города.', 'stories.first': 'Начать прогулку', 'stories.item': 'Городская история',
    'settings.eyebrow': 'Профиль', 'settings.title': 'Настройки', 'settings.account': 'Аккаунт', 'settings.logout': 'Выйти', 'settings.guide': 'Гид', 'settings.leads': '{guide} ведёт прогулку', 'settings.fullProfile': 'Нажмите для полного профиля', 'settings.appLanguage': 'Язык приложения', 'settings.guideLanguage': 'Язык гида', 'settings.privacy': 'История и приватность', 'settings.historyOn': 'Сохранять просмотренные объекты и прогулки', 'settings.historyOff': 'История отключена', 'settings.admin': 'Администрирование', 'settings.stats': 'Статистика полевого теста', 'settings.open': 'Открыть →',
    'guide.swipe': 'Свайпните для другого гида', 'guide.voice': 'Пример голоса', 'guide.voicePlaceholder': 'Приветствие и краткое знакомство', 'guide.voiceLoading': 'Готовлю голос…', 'guide.choose': 'Выбрать {guide}', 'guide.other': 'Другой гид →',
    'admin.title': 'Статистика', 'admin.back': '← В приложение', 'admin.users': 'пользователи', 'admin.active': 'активные', 'admin.objects': 'объекты', 'admin.total': 'расчёт без льгот', 'admin.note': 'Это внутренняя оценка по полной цене API, а не фактическая сумма счёта. Бесплатные ежемесячные квоты и скидки не вычтены. События сохраняются 30 дней.', 'admin.days': '{count} дней', 'admin.tokens': 'Токены OpenAI', 'admin.email': 'Email', 'admin.lastSession': 'Последняя сессия', 'admin.cost': 'Расчёт', 'admin.breakdown': 'Из чего складывается расчёт', 'admin.mapLoads': 'Загрузки карты', 'admin.nearby': 'Поиск объектов', 'admin.geocoding': 'Определение района', 'admin.textAi': 'Текст рассказов', 'admin.voiceAi': 'Голос и примеры', 'admin.calls': 'вызовов', 'admin.googleGross': 'Google Maps · без льгот',
  },
  en: {
    'nav.map': 'Map', 'nav.stories': 'Stories', 'nav.settings': 'Settings',
    'login.field': 'Field access · beta', 'login.admin': 'Operations access', 'login.copy': 'The city speaks while you walk. Choose a guide and start exploring.', 'login.adminCopy': 'Sign in with the administrator email and separate access code.', 'login.code': 'Access code', 'login.send': 'Get code', 'login.enter': 'Sign in', 'login.sent': 'Code sent. Check your email.', 'login.adminCode': 'Enter the administrator code.',
    'map.mode': 'Auto mode', 'map.modeWalking': 'Walking', 'map.modeVehicle': 'In a vehicle', 'map.listening': 'Listening to the city', 'map.ready': 'Ready to explore', 'map.searching': 'Looking for something nearby', 'map.nearby': 'Near you', 'map.gps': 'GPS active', 'map.speed': '{speed} km/h', 'map.start': 'Start', 'map.stop': 'Finish', 'map.copy': '{guide} will speak when something nearby is genuinely worth noticing.', 'map.play': 'Play story', 'map.pause': 'Pause', 'map.tapPlay': 'Your story is ready — tap Play', 'map.connecting': 'Connecting the map…', 'map.locate': 'Show my location', 'map.keyMissing': 'The map key is not configured', 'map.keyRejected': 'Google Maps rejected the key for this domain.', 'map.loadFailed': 'Could not load the map. Try again later.', 'map.geoUnsupported': 'Geolocation is not supported', 'map.geoPermission': 'Allow access to your location', 'map.geoFailed': 'Could not determine your location', 'map.speaking': '{guide} · audio',
    'stories.eyebrow': 'Personal archive', 'stories.title': 'Stories', 'stories.count': '{count} walks', 'stories.future': 'Future route', 'stories.emptyTitle': 'Your first walk starts here', 'stories.emptyCopy': 'Places you hear and routes you complete will become your personal city archive.', 'stories.first': 'Start your first walk', 'stories.item': 'City story',
    'settings.eyebrow': 'Profile', 'settings.title': 'Settings', 'settings.account': 'Account', 'settings.logout': 'Sign out', 'settings.guide': 'Guide', 'settings.leads': '{guide} leads your walk', 'settings.fullProfile': 'Tap for the full profile', 'settings.appLanguage': 'App language', 'settings.guideLanguage': 'Guide language', 'settings.privacy': 'History & privacy', 'settings.historyOn': 'Save viewed places and completed walks', 'settings.historyOff': 'History is off', 'settings.admin': 'Administration', 'settings.stats': 'Field-test statistics', 'settings.open': 'Open →',
    'guide.swipe': 'Swipe to meet the other guide', 'guide.voice': 'Voice sample', 'guide.voicePlaceholder': 'A short greeting and introduction', 'guide.voiceLoading': 'Preparing the voice…', 'guide.choose': 'Choose {guide}', 'guide.other': 'Other guide →',
    'admin.title': 'Statistics', 'admin.back': '← Back to app', 'admin.users': 'users', 'admin.active': 'active', 'admin.objects': 'places', 'admin.total': 'gross estimate', 'admin.note': 'This is an internal full-list-price estimate, not the amount billed. Monthly free usage caps and discounts are not deducted. Events are retained for 30 days.', 'admin.days': '{count} days', 'admin.tokens': 'OpenAI tokens', 'admin.email': 'Email', 'admin.lastSession': 'Last session', 'admin.cost': 'Estimate', 'admin.breakdown': 'Estimate breakdown', 'admin.mapLoads': 'Map loads', 'admin.nearby': 'Place searches', 'admin.geocoding': 'Area lookups', 'admin.textAi': 'Story text', 'admin.voiceAi': 'Voice and samples', 'admin.calls': 'calls', 'admin.googleGross': 'Google Maps · gross',
  },
};
function t(key, values = {}) { const template = messages[state.appLanguage]?.[key] || messages.ru[key] || key; return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), template); }
function movementModeLabel() { return t(state.movementMode === 'vehicle' ? 'map.modeVehicle' : 'map.modeWalking'); }
function movementMetaLabel() { return Number.isFinite(state.speedKmh) ? `${Math.round(state.speedKmh / (state.units === 'mi' ? 1.609344 : 1))} ${state.units === 'mi' ? (state.appLanguage === 'ru' ? 'миль/ч' : 'mph') : (state.appLanguage === 'ru' ? 'км/ч' : 'km/h')}` : t('map.gps'); }

let guides = {
  dana: { avatar: '/assets/dana-v3-avatar.png', image: '/assets/dana-v3-profile.png', ru: { name: 'Dana', role: 'Городской проводник', body: 'Живая, наблюдательная и любопытная. Dana замечает характер города, локальную жизнь и детали, мимо которых легко пройти.', interests: ['Скрытые места', 'Локальная жизнь', 'Атмосфера'], greeting: 'Привет! Я Dana. Будем идти в вашем ритме — я заговорю, когда рядом появится место, которое действительно стоит заметить.' }, en: { name: 'Dana', role: 'City companion', body: 'Lively, observant and curious. Dana notices the city’s character, local life and details that are easy to walk past.', interests: ['Hidden gems', 'Local life', 'Atmosphere'], greeting: 'Hi! I’m Dana. We’ll move at your pace, and I’ll speak when something nearby is genuinely worth noticing.' } },
  arthur: { avatar: '/assets/arthur-v3-avatar.png', image: '/assets/arthur-v3-profile.png', ru: { name: 'Arthur', role: 'Историк', body: 'Структурный, точный и внимательный. Arthur объясняет город через историю, архитектуру и решения людей.', interests: ['История', 'Архитектура', 'Контекст'], greeting: 'Здравствуйте. Я Arthur. Вместе мы увидим, как история, архитектура и человеческие решения сформировали город вокруг нас.' }, en: { name: 'Arthur', role: 'Historian', body: 'Structured, precise and attentive. Arthur explains the city through history, architecture and human decisions.', interests: ['History', 'Architecture', 'Context'], greeting: 'Hello. I’m Arthur. Together we’ll see how history, architecture and human decisions shaped the city around us.' } },
};
function guideCopy(id = state.guide) { const g = guides[id] || Object.values(guides)[0]; return { ...g, ...g[state.appLanguage], image: guideImageUrl(g.image), avatar: guideImageUrl(g.avatar) }; }
const storyAudio = new Audio();
storyAudio.preload = 'auto';
storyAudio.crossOrigin = 'anonymous';
storyAudio.addEventListener('play', updateAudioControl);
storyAudio.addEventListener('pause', updateAudioControl);
storyAudio.addEventListener('ended', updateAudioControl);
storyAudio.addEventListener('ended', () => {
  if (state.selectedPoi && state.audioUrl) {state.selectionStatus=state.appLanguage==='ru'?'Рассказ завершён. Кратко или подробнее?':'Finished. Hear a brief story or more detail?';renderSelectedStory();}
  if (state.sessionId && state.audioUrl) api('/drive/session/story/finish', { method: 'POST', body: JSON.stringify({ sessionId: state.sessionId, reason: 'ended' }) }).catch(() => {
    state.walkStatus = state.appLanguage === 'ru' ? 'Не удалось завершить рассказ. Перезапустите прогулку.' : 'Could not finish the story. Restart the walk.';
    const status = document.querySelector('#walk-status'); if (status) status.textContent = state.walkStatus;
  });
});
const sampleAudio = new Audio();
sampleAudio.preload = 'none';
sampleAudio.crossOrigin = 'anonymous';

const LIGHT_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#eef1eb' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#435047' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f8faf7' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#cbd4cc' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e7ece5' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dcebd7' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d9dfd9' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#e2e7e2' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfe6ec' }] },
];

async function api(path, options = {}) {
  const requestToken = state.token;
  const response = await fetch(`${config.apiUrl}${path}`, { signal: AbortSignal.timeout(35000), ...options, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith('/auth/') && requestToken && state.token === requestToken) {
    const email = state.user?.email || '';
    const message = state.appLanguage === 'ru' ? 'Срок входа истёк. Войдите снова, чтобы начать прогулку. Ваши настройки сохранены.' : 'Your sign-in expired. Sign in again to start exploring. Your settings are saved.';
    logout();
    document.querySelector('#email').value = email;
    document.querySelector('#auth-message').textContent = message;
    throw new Error(message);
  }
  if (!response.ok) { const error = new Error(body.error || `HTTP ${response.status}`); error.status = response.status; throw error; }
  return body;
}

function icon(name) {
  const paths = {
    map: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    stories: '<path d="M4 5.5h16v13H4z"/><path d="M8 9h8M8 13h6"/>',
    settings: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    locate: '<circle cx="12" cy="12" r="9"/><path d="m15 7-2 6-4 4 2-6z"/><path d="M12 1v2"/>',
    back: '<path d="m15 5-7 7 7 7"/>', play: '<path d="m9 7 8 5-8 5z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function setPath(path) { if (location.pathname !== path) history.pushState({}, '', path); }
function navigate(tab) { state.tab = tab; setPath(tab === 'admin' ? '/admin' : '/'); render(); }
function logout() { void sendActivity(true); stopWalking(false); localStorage.removeItem('heyCityToken'); localStorage.removeItem('heyCityUser'); sessionStorage.removeItem('heyCityToken'); sessionStorage.removeItem('heyCityUser'); state.token = null; state.user = null; state.profile = null; state.map = null; state.mapLoadPromise = null; state.marker = null; state.tab = 'map'; setPath('/'); render(); }

function loginView() {
  const adminLogin = location.pathname === '/admin';
  app.innerHTML = `<section class="login"><div class="login-intro"><div class="eyebrow">${adminLogin ? t('login.admin') : t('login.field')}</div><h1 class="wordmark">Hey<br>City</h1><p class="intro">${adminLogin ? t('login.adminCopy') : t('login.copy')}</p></div>
    <form class="auth-form" id="auth-form"><label for="email">Email</label><input id="email" type="email" autocomplete="email" required placeholder="you@example.com"><div id="code-wrap" hidden><label for="code">${t('login.code')}</label><input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000"></div><button class="primary" type="submit">${t('login.send')}</button><p class="message" id="auth-message"></p></form></section>`;
  const form = document.querySelector('#auth-form');
  let sent = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.querySelector('#auth-message'); const button = form.querySelector('button'); const email = document.querySelector('#email').value.trim().toLowerCase();
    message.textContent = ''; button.disabled = true;
    try {
      if (!sent) {
        const result = await api('/auth/otp/send', { method: 'POST', body: JSON.stringify({ email }) });
        sent = true; document.querySelector('#code-wrap').hidden = false; document.querySelector('#code').required = true; document.querySelector('#code').focus(); button.textContent = t('login.enter'); message.dataset.tone = 'success'; message.textContent = result.message === 'Enter administrator access code' ? t('login.adminCode') : t('login.sent');
      } else {
        const result = await api('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email, code: document.querySelector('#code').value }) });
        state.token = result.token; state.user = result.user; localStorage.setItem('heyCityToken', state.token); localStorage.setItem('heyCityUser', JSON.stringify(state.user)); state.tab = state.user.role === 'admin' && location.pathname === '/admin' ? 'admin' : 'map'; render(); void sendActivity();
      }
    } catch (error) { message.dataset.tone = 'error'; message.textContent = error.message; } finally { button.disabled = false; }
  });
}

function shell(content, active = state.tab) {
  if (!app.querySelector('.shell')) {
    app.innerHTML = `<div class="shell"><section class="screen"><div class="view-layer map-view" id="map-view" hidden></div><div class="view-layer page-view" id="page-view"></div></section><nav class="nav" aria-label="Main navigation"><button data-tab="map">${icon('map')}<span></span></button><button data-tab="stories">${icon('stories')}<span></span></button><button data-tab="settings">${icon('settings')}<span></span></button></nav></div>`;
    app.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.tab)));
  }
  const mapHost = app.querySelector('#map-view');
  const pageHost = app.querySelector('#page-view');
  const showingMap = active === 'map';
  mapHost.hidden = !showingMap;
  pageHost.hidden = showingMap;
  let mountedMap = false;
  if (showingMap) {
    if (mapHost.dataset.mounted !== 'true') {
      mapHost.innerHTML = content;
      mapHost.dataset.mounted = 'true';
      mountedMap = true;
    }
  } else {
    pageHost.innerHTML = content;
    pageHost.scrollTop = 0;
  }
  app.querySelectorAll('[data-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === active);
    button.querySelector('span').textContent = t(`nav.${button.dataset.tab}`);
  });
  return mountedMap;
}

function mapView() {
  const guide = guideCopy();
  const walking = state.watchId !== null;
  const lastTitle = state.lastResult?.poi?.name || state.lastResult?.target?.name || state.lastResult?.decision?.poiName;
  const lastCopy = state.lastResult?.transcriptText;
  const mountedMap = shell(`<div id="map" class="map"><div class="map-state" id="map-state">${t('map.connecting')}</div></div><div class="map-failure" id="map-failure" hidden>${t('map.keyRejected')}</div><div class="map-shade" aria-hidden="true"></div><div class="radar-scan" id="radar-scan" hidden aria-hidden="true"><i class="radar-ring radar-ring-a"></i><i class="radar-ring radar-ring-b"></i></div>
    <header class="map-header"><button class="icon-button" id="open-menu" aria-label="${t('nav.settings')}">${icon('menu')}</button><div class="walking-status ${walking ? 'is-live' : ''}"><i></i><span id="top-status">${walking ? movementModeLabel() : t('map.mode')}</span></div><button class="guide-avatar" id="open-guide" aria-label="${esc(guide.name)}"><img src="${esc(guide.avatar)}" alt=""></button></header>
    <button class="map-locate" id="locate" aria-label="${t('map.locate')}">${icon('locate')}</button>
    <article class="walking-sheet"><button class="sheet-handle" aria-label="Свернуть или раскрыть список" aria-expanded="true"></button><div class="sheet-kicker"><span id="walk-status">${esc(walking ? state.walkStatus : t('map.ready'))}</span><span class="area-label">${walking ? movementMetaLabel() : t('map.nearby')}</span></div><div class="ambient-row"><img class="ambient-avatar" src="${esc(guide.avatar)}" alt="${esc(guide.name)}"><div><h1 id="place-title">${esc(lastTitle || t('map.listening'))}</h1><p id="place-copy">${esc(lastCopy || t('map.copy', { guide: guide.name }))}</p></div></div><div class="story-audio" id="story-audio" ${state.audioUrl ? '' : 'hidden'}><button class="audio-button" id="audio-toggle">${icon('play')}<span>${storyAudio.paused ? t('map.play') : t('map.pause')}</span></button></div><div class="sheet-actions"><button class="primary" id="start-walk" ${walking ? 'hidden' : ''}>${t('map.start')}</button><button class="secondary" id="stop-walk" ${walking ? '' : 'hidden'}>${t('map.stop')}</button></div></article>`, 'map');
  if (mountedMap) {
    document.querySelector('.sheet-handle').onclick = event => { const sheet = event.currentTarget.closest('.walking-sheet'); const collapsed = sheet.classList.toggle('is-collapsed'); event.currentTarget.setAttribute('aria-expanded', String(!collapsed)); if (state.followPosition) frameUserPosition(); };
    document.querySelector('#start-walk').addEventListener('click', startWalking); document.querySelector('#stop-walk').addEventListener('click', stopWalking); document.querySelector('#locate').addEventListener('click', toggleMapOrientation); document.querySelector('#open-menu').addEventListener('click', () => navigate('settings')); document.querySelector('#open-guide').addEventListener('click', () => openGuideProfile(state.guide)); document.querySelector('#audio-toggle')?.addEventListener('click', toggleStoryAudio);
  }
  refreshMapView();
  void loadMap();
  if (mountedMap && !state.lastPoint) void locateUser().catch(showLocationError);
}

function refreshMapView() {
  const host = document.querySelector('#map-view');
  if (!host) return;
  const guide = guideCopy();
  const walking = state.watchId !== null;
  const lastTitle = state.lastResult?.poi?.name || state.lastResult?.target?.name || state.lastResult?.decision?.poiName;
  const lastCopy = state.lastResult?.transcriptText;
  host.querySelector('.walking-status')?.classList.toggle('is-live', walking);
  host.querySelector('#top-status').textContent = walking ? movementModeLabel() : t('map.mode');
  host.querySelector('#walk-status').textContent = walking ? state.walkStatus || t('map.listening') : t('map.ready');
  host.querySelector('.area-label').textContent = walking ? movementMetaLabel() : t('map.nearby');
  host.querySelector('#place-title').textContent = lastTitle || t('map.listening');
  host.querySelector('#place-copy').textContent = lastCopy || t('map.copy', { guide: guide.name });
  host.querySelector('#start-walk').hidden = walking;
  host.querySelector('#start-walk').textContent = t('map.start');
  host.querySelector('#stop-walk').hidden = !walking;
  host.querySelector('#stop-walk').textContent = t('map.stop');
  host.querySelector('#locate').setAttribute('aria-label', t('map.locate'));
  host.querySelector('#open-menu').setAttribute('aria-label', t('nav.settings'));
  const guideButton = host.querySelector('#open-guide');
  guideButton.setAttribute('aria-label', guide.name);
  guideButton.querySelector('img').src = guide.avatar;
  const ambientAvatar = host.querySelector('.ambient-avatar');
  ambientAvatar.src = guide.avatar;
  ambientAvatar.alt = guide.name;
  setRadarScanning(walking && state.contextInFlight);
  renderAudioControl();
  renderNearbyList();
  applyMapOrientation();
}

async function loadMap() {
  if (state.map) {
    setTimeout(() => {
      window.google?.maps?.event?.trigger?.(state.map, 'resize');
      if (state.lastPoint) state.map.setCenter(state.lastPoint);
    }, 0);
    return;
  }
  if (state.mapLoadPromise) return state.mapLoadPromise;
  const status = document.querySelector('#map-state');
  if (!config.googleMapsBrowserKey) { if (status) status.textContent = t('map.keyMissing'); return; }
  window.gm_authFailure = () => { const node = document.querySelector('#map-failure'); if (node) { node.hidden = false; node.textContent = t('map.keyRejected'); } };
  state.mapLoadPromise = (async () => { try {
    if (typeof window.google?.maps?.Map !== 'function') await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // loading=async signals readiness through callback, not the script load event.
      window.heyCityMapsReady = () => {
        if (typeof window.google?.maps?.Map === 'function') resolve();
        else reject(new Error('Google Maps callback returned without Map constructor'));
      };
      script.async = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsBrowserKey)}&v=weekly&loading=async&callback=heyCityMapsReady`;
      script.onerror = () => { script.remove(); reject(new Error('Google Maps script failed to load')); };
      document.head.appendChild(script);
    });
    const mapNode = document.querySelector('#map'); if (!mapNode) return;
    state.map = new google.maps.Map(mapNode, { center: state.lastPoint || { lat: 40.7128, lng: -74.006 }, zoom: 15, renderingType: 'VECTOR', heading: 0, tilt: 0, disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy', styles: LIGHT_MAP_STYLES });
    state.map.addListener?.('dragstart', () => { state.followPosition = false; });
    if (state.lastPoint) state.marker = new google.maps.Marker({ map: state.map, position: state.lastPoint, zIndex: 20 });
    document.querySelector('#map-state')?.setAttribute('hidden', ''); document.querySelector('#map-failure')?.setAttribute('hidden', ''); api('/usage/client', { method: 'POST', body: JSON.stringify({ operation: 'dynamic_map_load' }) }).catch(() => {});
  } catch { const failure = document.querySelector('#map-failure'); if (failure) { failure.hidden = false; failure.textContent = t('map.loadFailed'); } else if (status) status.textContent = t('map.loadFailed'); } finally { state.mapLoadPromise = null; } })();
  return state.mapLoadPromise;
}

function showLocationError(error) {
  state.walkStatus = error.message || t('map.geoFailed');
  const node = document.querySelector('#walk-status');
  if (node) node.textContent = state.walkStatus;
}

function applyPosition(position) {
  const { latitude: lat, longitude: lng } = position.coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(t('map.geoFailed'));
  updateHeading(position);
  state.lastPosition = position;
  state.lastPoint = { lat, lng };
  applyMapOrientation();
  if (state.followPosition) frameUserPosition();
  if (state.map) {
    if (state.marker) state.marker.setPosition(state.lastPoint);
    else state.marker = new google.maps.Marker({ map: state.map, position: state.lastPoint });
  }
}

function locateUser() {
  if (state.locationPromise) return state.locationPromise;
  if (!state.sessionId) showLocationError({ message: t('map.gps') });
  state.locationPromise = new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error(t('map.geoUnsupported'))); return; }
    navigator.geolocation.getCurrentPosition(resolve, (error) => reject(new Error(error.code === 1 ? t('map.geoPermission') : t('map.geoFailed'))),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 });
  }).then((position) => {
    applyPosition(position);
    if (!state.sessionId) showLocationError({ message: t('map.ready') });
    return position;
  }).finally(() => { state.locationPromise = null; });
  return state.locationPromise;
}

async function startWalking() {
  if (state.starting || state.watchId !== null) return;
  primeStoryAudio();
  state.starting = true;
  const runId = ++state.runId;
  try {
    const position = await locateUser();
    if (runId !== state.runId) return;
    const result = await api('/sessions/start', { method: 'POST', body: JSON.stringify({ mode: 'walking', autoMode: true, themeTags: ['mixed'], narrationStyle: 'documentary', lengthSec: 90, leadTimeMin: 2, voiceId: state.guide, language: state.guideLanguage, autoplay: true }) });
    if (runId !== state.runId) { void api(`/sessions/${result.sessionId}/end`, { method: 'POST', body: '{}' }).catch(() => {}); return; }
    state.sessionId = result.sessionId;
    void syncScreenLock();
    state.initialScanComplete = false;
    state.lastContextAt = 0;
    state.walkStatus = t('map.searching');
    state.watchId = navigator.geolocation.watchPosition((fix) => {
      if (runId === state.runId) void updateLocation(fix);
    }, (error) => {
      if (runId !== state.runId) return;
      // A background timeout is recoverable; permission revocation is not.
      if (error.code !== 1) {
        if (!document.hidden) showLocationError(new Error(t('map.geoFailed')));
        return;
      }
      stopWalking(false);
      refreshMapView();
      showLocationError(new Error(error.code === 1 ? t('map.geoPermission') : t('map.geoFailed')));
    }, { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 });
    refreshMapView();
    await updateLocation(position);
  } catch (error) {
    if (runId === state.runId) {
      stopWalking(false);
      refreshMapView();
      showLocationError(error);
    }
  } finally { if (runId === state.runId) state.starting = false; }
}

async function updateLocation(position) {
  if (!state.sessionId || state.watchId === null) return;
  const sessionId = state.sessionId;
  const requestedGuide = state.guide;
  const { latitude: lat, longitude: lng, heading, speed, accuracy } = position.coords; const point = { lat, lng }; const measuredSpeedKmh = Math.max(0, (speed ?? 0) * 3.6); state.speedKmh = measuredSpeedKmh; applyPosition(position);
  if (state.contextInFlight) return;
  if (Date.now() - state.lastContextAt < 5000) return;
  state.lastContextAt = Date.now();
  state.contextInFlight = true;
  const initialScan = !state.initialScanComplete;
  if (initialScan) setRadarScanning(true);
  try {
    const result = await api(`/sessions/${state.sessionId}/context`, { method: 'POST', body: JSON.stringify({ lat, lng, heading: heading ?? null, speed: measuredSpeedKmh, accuracyMeters: accuracy, timestamp: Date.now(), discoveryOnly:true }) });
    if (state.sessionId !== sessionId) return;
    state.lastResult = result; state.movementMode = result.mode === 'vehicle' ? 'vehicle' : 'walking'; state.speedKmh = Number.isFinite(result.speedKmh) ? result.speedKmh : measuredSpeedKmh; state.walkStatus = result.nextAction === 'PLAY' ? t('map.speaking', { guide: guideCopy().name }) : t('map.listening');
    if (result.aheadDiscovery?.providerRefresh?.errorCode) {
      state.walkStatus = state.appLanguage === 'ru' ? 'Поиск объектов недоступен. Попробуйте позже.' : 'Place search is unavailable. Try again later.';
    }
    renderCandidateMarkers(result.aheadDiscovery?.nearbyCandidates || result.aheadDiscovery?.topCandidates || []);
    renderNearbyList();
    const title = result.poi?.name || result.target?.name || result.decision?.poiName; const statusNode = document.querySelector('#walk-status'); const titleNode = document.querySelector('#place-title'); const copyNode = document.querySelector('#place-copy'); const modeNode = document.querySelector('#top-status'); const metaNode = document.querySelector('.area-label'); if (statusNode) statusNode.textContent = state.walkStatus; if (modeNode) modeNode.textContent = movementModeLabel(); if (metaNode) metaNode.textContent = movementMetaLabel(); if (title && titleNode) titleNode.textContent = title; if (result.transcriptText && copyNode) copyNode.textContent = result.transcriptText;
    if (result.nextAction === 'PLAY' && copyNode) {
      const source = result.narrativePlan?.storySeed?.match(/https:\/\/en\.wikipedia\.org\/\?curid=\d+/)?.[0];
      if (source) { const link = document.createElement('a'); link.href = source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = ' Wikipedia · CC BY-SA'; copyNode.append(link); }
    }
    if (result.audioUrl && result.nextAction === 'PLAY') { state.audioGuideId = requestedGuide; state.audioUrl = result.audioUrl; storyAudio.src = result.audioUrl; renderAudioControl(); storyAudio.play().catch(() => { state.walkStatus = t('map.tapPlay'); if (statusNode) statusNode.textContent = state.walkStatus; updateAudioControl(); }); }
    renderSelectedStory();
    if (result.suggestedPoiId && !state.selectingPlace && (!state.audioUrl || storyAudio.ended)) void selectNearbyPlace(result.suggestedPoiId,'identify');
  } catch (error) { if (state.sessionId !== sessionId) return; if (error.status === 404 && error.message === 'Session not found') { stopWalking(false); refreshMapView(); showLocationError({message: state.appLanguage === 'ru' ? 'Сессия завершена на сервере. Нажмите «Начать» для продолжения.' : 'Session ended on server. Tap Start to continue.'}); return; } state.walkStatus = error.message; const statusNode = document.querySelector('#walk-status'); if (statusNode) statusNode.textContent = state.walkStatus; }
  finally { if (state.sessionId !== sessionId) return; state.contextInFlight = false; if (initialScan) { state.initialScanComplete = true; setRadarScanning(false); } }
}

function setRadarScanning(scanning) {
  const radar = document.querySelector('#radar-scan');
  if (radar) { radar.hidden = !scanning; radar.classList.toggle('vehicle-radar',state.movementMode === 'vehicle'); radar.style.setProperty('--course-bearing',`${(state.heading || 0) - (state.map?.getHeading?.() || 0)}deg`); }
  document.querySelector('#map-view')?.classList.toggle('is-scanning', scanning);
}

function clearCandidateMarkers() {
  state.candidateMarkers.forEach((marker) => marker.setMap(null));
  state.candidateMarkers = [];
}

function markerCode(targetType) {
  targetType = String(targetType || '');
  if (targetType === 'museum') return 'M';
  if (targetType.includes('park') || targetType === 'natural_feature') return 'P';
  if (targetType === 'bridge') return 'B';
  if (targetType === 'city' || targetType === 'town' || targetType === 'locality') return 'C';
  if (targetType === 'university') return 'U';
  return 'H';
}

function candidateIcon(targetType) {
  const code = markerCode(targetType);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42"><path d="M17 1.5c-8.6 0-15.5 6.8-15.5 15.2C1.5 28 17 40.5 17 40.5S32.5 28 32.5 16.7C32.5 8.3 25.6 1.5 17 1.5Z" fill="#f8faf7" stroke="#0f7a3f" stroke-width="2"/><circle cx="17" cy="16.5" r="9" fill="#0f7a3f"/><text x="17" y="20" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="white">${code}</text></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}` };
}

function renderCandidateMarkers(candidates) {
  if (!state.map || !window.google?.maps?.Marker) return;
  clearCandidateMarkers();
  state.candidateMarkers = candidates.slice(0, 5).map((candidate, index) => new google.maps.Marker({
    map: state.map,
    position: { lat: candidate.latitude, lng: candidate.longitude },
    title: candidate.name,
    icon: candidateIcon(candidate.targetType),
    label: { text: candidate.name.length > 22 ? `${candidate.name.slice(0, 21)}…` : candidate.name, className: 'poi-map-label' },
    zIndex: 10 - index,
  }));
}

function renderAudioControl() { const wrap = document.querySelector('#story-audio'); if (!wrap) return; wrap.hidden = !state.audioUrl; const button = document.querySelector('#audio-toggle'); if (button) { button.innerHTML = `${icon('play')}<span>${storyAudio.paused ? t('map.play') : t('map.pause')}</span>`; button.onclick = toggleStoryAudio; } }
function updateAudioControl() { renderAudioControl(); renderNearbyList(); }
function toggleStoryAudio() { if (!state.audioUrl) return; if (storyAudio.error) { storyAudio.src = state.audioUrl; storyAudio.load(); } if (storyAudio.paused) storyAudio.play().catch(() => showLocationError({message:t('map.tapPlay')})); else storyAudio.pause(); }
function stopWalking(refresh = true) { state.selectionRevision++; state.selectionController?.abort(); state.selectingPlace=false; state.selectedPoi=null; state.selectionStatus=""; state.lastContextAt=0; state.lastResult=null; state.runId++; state.starting = false; if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId); state.watchId = null; if (state.sessionId) api(`/sessions/${state.sessionId}/end`, { method: 'POST', body: '{}' }).catch(() => {}); state.sessionId = null; void syncScreenLock(); state.contextInFlight = false; state.initialScanComplete = false; state.movementMode = 'walking'; state.speedKmh = null; setRadarScanning(false); clearCandidateMarkers(); state.walkStatus = t('map.ready'); state.audioUrl = null; storyAudio.pause(); storyAudio.removeAttribute('src'); storyAudio.load(); syncMediaSession(); if (refresh && state.tab === 'map') render(); }

function storiesView() {
  const historyItems = state.profile?.history || [];
  shell(`<div class="page stories-page"><div class="page-heading"><div><div class="eyebrow">${t('stories.eyebrow')}</div><h1>${t('stories.title')}</h1></div><span class="count">${t('stories.count', { count: historyItems.length })}</span></div>${historyItems.length ? `<div class="story-list">${historyItems.map((item, index) => `<article class="story-item"><div class="story-index">${String(index + 1).padStart(2, '0')}</div><div><strong>${esc(item.placeId || t('stories.item'))}</strong><p>${new Date(item.completedAt || item.timestamp).toLocaleDateString(state.appLanguage)}</p></div></article>`).join('')}</div>` : `<div class="story-empty"><div class="story-photo"><img src="/assets/trinity-church.webp" alt="City street"><span>${t('stories.future')}</span></div><h2>${t('stories.emptyTitle')}</h2><p>${t('stories.emptyCopy')}</p><button class="primary" id="first-walk">${t('stories.first')}</button></div>`}</div>`, 'stories');
  document.querySelector('#first-walk')?.addEventListener('click', () => navigate('map')); if (!state.profile) loadProfileAndRefresh('stories');
}

function settingsView() {
  const selected = guideCopy();
  shell(`<div class="page settings-page"><header class="settings-sticky"><div class="eyebrow">${t('settings.eyebrow')}</div><h1>${t('settings.title')}</h1></header><section class="settings-section account-line"><div><span class="section-label">${t('settings.account')}</span><strong>${esc(state.user?.email)}</strong></div><button class="text-button" id="logout">${t('settings.logout')}</button></section>
    <section class="settings-section"><div class="section-head"><div><span class="section-label">${t('settings.guide')}</span><h2>${t('settings.leads', { guide: selected.name })}</h2></div><span class="section-note">${t('settings.fullProfile')}</span></div><div class="guide-grid">${Object.keys(guides).map((id) => { const guide = guideCopy(id); return `<button class="guide-card ${state.guide === id ? 'selected' : ''}" data-guide="${id}"><img src="${esc(guide.image)}" alt="${esc(guide.name)}"><span><strong>${esc(guide.name)}</strong><small>${esc(guide.role)}</small></span></button>`; }).join('')}</div></section>
    <section class="settings-section settings-table"><div><span class="section-label">${t('settings.appLanguage')}</span><div class="segmented"><button data-language="ru" class="${state.appLanguage === 'ru' ? 'selected' : ''}">Русский</button><button data-language="en" class="${state.appLanguage === 'en' ? 'selected' : ''}">English</button></div></div><div><span class="section-label">${t('settings.guideLanguage')}</span><div class="segmented"><button data-guide-language="ru" class="${state.guideLanguage === 'ru' ? 'selected' : ''}">Русский</button><button data-guide-language="en" class="${state.guideLanguage === 'en' ? 'selected' : ''}">English</button></div></div><div><span class="section-label">${state.appLanguage === 'ru' ? 'Скорость и расстояние' : 'Speed & distance'}</span><div class="segmented"><button data-units="km" class="${state.units === 'km' ? 'selected' : ''}">км / km</button><button data-units="mi" class="${state.units === 'mi' ? 'selected' : ''}">мили / miles</button></div></div><div><span class="section-label">${t('settings.privacy')}</span><p>${state.profile?.historyEnabled === false ? t('settings.historyOff') : t('settings.historyOn')}</p></div></section>
    ${state.user?.role === 'admin' ? `<section class="settings-section account-line"><div><span class="section-label">${t('settings.admin')}</span><strong>${t('settings.stats')}</strong></div><button class="text-button" id="open-admin">${t('settings.open')}</button></section>` : ''}<footer class="settings-footer">Hey City WebApp · beta</footer></div>`, 'settings');
  document.querySelectorAll('[data-units]').forEach(button => button.addEventListener('click', () => { state.units = button.dataset.units; localStorage.setItem('heyCityUnits', state.units); settingsView(); }));
  document.querySelector('#logout').addEventListener('click', logout); document.querySelector('#open-admin')?.addEventListener('click', () => navigate('admin')); document.querySelectorAll('[data-guide]').forEach((button) => button.addEventListener('click', () => openGuideProfile(button.dataset.guide))); document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => { state.appLanguage = button.dataset.language; localStorage.setItem('heyCityLanguage', state.appLanguage); state.walkStatus = state.watchId === null ? t('map.ready') : t('map.listening'); settingsView(); })); document.querySelectorAll('[data-guide-language]').forEach((button) => button.addEventListener('click', () => { state.guideLanguage = button.dataset.guideLanguage; localStorage.setItem('heyCityGuideLanguage', state.guideLanguage); resetSelectionForLanguage(); api('/me', { method: 'PUT', body: JSON.stringify({ driveDiscovery: { languageDefault: state.guideLanguage } }) }).catch(() => {}); settingsView(); })); if (!state.profile) loadProfileAndRefresh('settings');
}

async function loadProfileAndRefresh(view) {
  try {
    state.profile = await api('/me');
    if (!localStorage.getItem('heyCityGuideLanguage')) {
      const savedGuideLanguage = state.profile?.driveDiscovery?.languageDefault;
      if (savedGuideLanguage === 'ru' || savedGuideLanguage === 'en') {
        state.guideLanguage = savedGuideLanguage;
        localStorage.setItem('heyCityGuideLanguage', savedGuideLanguage);
      }
    }
  } catch { state.profile = { history: [], historyEnabled: true }; }
  if (state.tab === view) render();
}

function openGuideProfile(initialGuide) {
  let activeGuide = initialGuide;
  const draw = () => {
    document.querySelector('#guide-profile')?.remove(); const guide = guideCopy(activeGuide);
    document.body.insertAdjacentHTML('beforeend', `<div class="guide-profile" id="guide-profile" role="dialog" aria-modal="true" aria-label="${esc(guide.name)}"><div class="profile-photo"><img src="${esc(guide.image)}" alt="${esc(guide.name)}"><button class="profile-back" id="close-profile" aria-label="Back">${icon('back')}</button><span class="swipe-hint">${t('guide.swipe')}</span></div><div class="profile-content"><div class="profile-title"><div><h1>${esc(guide.name)}</h1><span>${esc(guide.role)}</span></div><code>${Object.keys(guides).indexOf(activeGuide) + 1} / ${Object.keys(guides).length}</code></div><p>${esc(guide.body)}</p><div class="interest-line">${guide.interests.map(esc).join(' · ')}</div><button class="voice-sample" id="voice-sample">${icon('play')}<span><strong>${t('guide.voice')}</strong><small>${t('guide.voicePlaceholder')}</small></span></button><blockquote id="voice-copy" hidden>${esc(guide.greeting)}</blockquote><div class="profile-actions"><button class="primary" id="choose-guide">${t('guide.choose', { guide: guide.name })}</button><button class="text-button" id="switch-guide">${t('guide.other')}</button></div></div></div>`);
    document.querySelector('#close-profile').addEventListener('click', closeGuideProfile); document.querySelector('#voice-sample').addEventListener('click', async (event) => { const button = event.currentTarget; const copy = document.querySelector('#voice-copy'); copy.hidden = false; if (sampleAudio.src && sampleAudio.dataset.guide === activeGuide && sampleAudio.dataset.lang === state.guideLanguage) { if (sampleAudio.paused) await sampleAudio.play().catch(() => {}); else sampleAudio.pause(); return; } if (!sampleAudio.src) primeStoryAudio(sampleAudio); button.querySelector('small').textContent = t('guide.voiceLoading'); button.disabled = true; try { const result = await api('/stories/voice-sample', { method: 'POST', body: JSON.stringify({ voiceId: activeGuide, lang: state.guideLanguage }) }); sampleAudio.src = result.audioUrl; sampleAudio.dataset.guide = activeGuide; sampleAudio.dataset.lang = state.guideLanguage; await sampleAudio.play(); } catch (error) { button.querySelector('small').textContent = error.message; } finally { button.disabled = false; } }); document.querySelector('#switch-guide').addEventListener('click', () => { sampleAudio.pause(); activeGuide = nextGuideId(activeGuide); draw(); }); document.querySelector('#choose-guide').addEventListener('click', () => { selectGuide(activeGuide); closeGuideProfile(); render(); });
    let startX = null; const modal = document.querySelector('#guide-profile'); modal.addEventListener('touchstart', (event) => { startX = event.touches[0].clientX; }, { passive: true }); modal.addEventListener('touchend', (event) => { if (startX !== null && Math.abs(event.changedTouches[0].clientX - startX) > 60) { activeGuide = nextGuideId(activeGuide); draw(); } }, { passive: true });
  };
  draw();
}

function closeGuideProfile() { sampleAudio.pause(); document.querySelector('#guide-profile')?.remove(); }

async function adminView() {
  if (state.user?.role !== 'admin') { navigate('settings'); return; }
  shell(`<div class="page admin-page"><header class="admin-head"><div><div class="eyebrow">Hey City · operations</div><h1>${t('admin.title')}</h1></div><div class="admin-actions"><button class="text-button" id="admin-back">${t('admin.back')}</button><button class="text-button" id="admin-logout">${t('settings.logout')}</button><select class="period" id="period"><option value="7">${t('admin.days', { count: 7 })}</option><option value="30" selected>${t('admin.days', { count: 30 })}</option><option value="90">${t('admin.days', { count: 90 })}</option></select></div></header><div id="admin-data" class="empty">…</div><section id="account-analytics"></section><section id="guide-admin"></section></div>`, '');
  document.querySelector('#admin-back').addEventListener('click', () => navigate('map')); document.querySelector('#admin-logout').addEventListener('click', logout); document.querySelector('#period').addEventListener('change', loadAdmin); await loadAdmin(); await loadGuideAdmin();
}

async function loadAdmin() {
  const node = document.querySelector('#admin-data'); if (!node) return;
  try {
    const days = document.querySelector('#period')?.value || 30; void loadAccountAnalytics(days); const [summary, list] = await Promise.all([api(`/admin/summary?days=${days}`), api('/admin/users')]); const totals = summary.totals || []; const matching = (category, operation) => totals.filter((item) => item.category === category && (!operation || item.operation === operation)); const value = (category, field = 'quantity', operation) => matching(category, operation).reduce((sum, item) => sum + Number(item[field] || 0), 0); const categoryCost = (category, operation) => value(category, 'estimated_cost_usd', operation); const cost = totals.reduce((sum, item) => sum + Number(item.estimated_cost_usd || 0), 0); const textTokens = value('openai_text', 'input_tokens') + value('openai_text', 'output_tokens'); const voiceTokens = value('openai_tts', 'input_tokens') + value('openai_tts', 'output_tokens'); const tokens = textTokens + voiceTokens; const googleCost = categoryCost('google_maps');
    const costRow = (label, category, operation, tokenCount = null) => `<div><span>${label}</span><code>${value(category, 'quantity', operation)} ${t('admin.calls')}${tokenCount === null ? '' : ` · ${tokenCount} tokens`}</code><b>$${categoryCost(category, operation).toFixed(4)}</b></div>`;
    node.className = ''; node.innerHTML = `<section class="metrics"><div class="metric"><b>${summary.users}</b><span>${t('admin.users')}</span></div><div class="metric"><b>${summary.activeUsers}</b><span>${t('admin.active')}</span></div><div class="metric"><b>${value('product', 'quantity', 'object_viewed')}</b><span>${t('admin.objects')}</span></div><div class="metric"><b>${tokens}</b><span>${t('admin.tokens')}</span></div><div class="metric"><b>$${googleCost.toFixed(2)}</b><span>${t('admin.googleGross')}</span></div><div class="metric"><b>$${cost.toFixed(2)}</b><span>${t('admin.total')}</span></div></section><section class="cost-breakdown"><h2>${t('admin.breakdown')}</h2>${costRow(t('admin.mapLoads'), 'google_maps', 'dynamic_map_load')}${costRow(t('admin.nearby'), 'google_maps', 'places_nearby_new')}${costRow(t('admin.geocoding'), 'google_maps', 'reverse_geocoding')}${costRow(t('admin.textAi'), 'openai_text', null, textTokens)}${costRow(t('admin.voiceAi'), 'openai_tts', null, voiceTokens)}</section><p class="footnote">${state.appLanguage === 'ru' ? 'Новая диагностика: попытки определения района / ошибки' : 'New diagnostics: area attempts / errors'}: ${value('product', 'quantity', 'reverse_geocoding_attempt')} / ${value('product', 'quantity', 'reverse_geocoding_error')}. ${state.appLanguage === 'ru' ? 'Попытки поиска объектов / ошибки' : 'Place search attempts / errors'}: ${value('product', 'quantity', 'places_nearby_new_attempt')} / ${value('product', 'quantity', 'places_nearby_new_error')}. ${state.appLanguage === 'ru' ? 'Исторические суммы не пересчитаны; новые ошибки исключены из оценки успешных вызовов.' : 'Historical totals unchanged; new errors excluded from successful-call estimates.'}</p><div class="table-wrap"><table><thead><tr><th>${t('admin.email')}</th><th>${t('admin.lastSession')}</th><th>${t('admin.objects')}</th><th>${t('admin.tokens')}</th><th>${t('admin.cost')}</th></tr></thead><tbody>${list.users.map((user) => `<tr><td>${esc(user.email)}</td><td>${new Date(user.last_seen_at).toLocaleString(state.appLanguage)}</td><td>${user.objects_viewed}</td><td>${user.tokens}</td><td>$${Number(user.estimated_cost_usd).toFixed(4)}</td></tr>`).join('')}</tbody></table></div><p class="footnote">${t('admin.note')} ${state.appLanguage === 'ru' ? 'Не привязано к аккаунтам' : 'Unassigned to accounts'}: ${Number(summary.unassignedCostUsd || 0).toFixed(4)}.</p>`;
  } catch (error) { node.className = 'message'; node.textContent = error.message; }
}

function render() { closeGuideProfile(); if (!state.token) return loginView(); if (state.tab === 'admin') return void adminView(); if (state.tab === 'stories') return storiesView(); if (state.tab === 'settings') return settingsView(); return mapView(); }
window.addEventListener('popstate', () => { state.tab = location.pathname === '/admin' ? 'admin' : 'map'; render(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js');
render();

function guideImageUrl(path) {
  return path?.startsWith('/media/guide-') ? `${config.apiUrl}${path}` : path;
}
function nextGuideId(id) {
  const ids = Object.keys(guides); return ids[(ids.indexOf(id) + 1) % ids.length];
}
async function loadGuideCatalog() {
  try {
    const result = await api('/guides');
    if (!Array.isArray(result.guides) || !result.guides.length) return;
    const next = Object.fromEntries(result.guides.filter(g => /^[a-z][a-z0-9_-]{1,39}$/.test(g.id) && g.active && g.ru && g.en && /^\/(assets|media)\/[a-zA-Z0-9._-]+$/.test(g.avatar) && /^\/(assets|media)\/[a-zA-Z0-9._-]+$/.test(g.image)).map(g => [g.id, g]));
    if (!Object.keys(next).length) return;
    guides = next;
    if (!guides[state.guide]) selectGuide(Object.keys(guides)[0]);
    if (state.tab !== 'admin') render();
  } catch { /* Bundled guides remain available during temporary network loss. */ }
}
function selectGuide(id) {
  state.guide = id; localStorage.setItem('heyCityGuide', id);
  if (state.sessionId) api(`/sessions/${state.sessionId}/guide`, { method: 'PUT', body: JSON.stringify({ guideId: id }) }).catch(showLocationError);
  void sendActivity();
}

function updateHeading(position) {
  const { latitude: lat, longitude: lng, heading, speed, accuracy } = position.coords;
  let value = Number.isFinite(heading) && heading >= 0 && (speed ?? 0) > 0.8 ? heading : null;
  const p = state.previousFix;
  if (p && value === null) {
    const dy = (lat - p.lat) * 111320, dx = (lng - p.lng) * 111320 * Math.cos(lat * Math.PI / 180);
    if (Math.hypot(dx, dy) >= Math.max(15, accuracy || 0, p.accuracy || 0)) value = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  }
  if (value !== null) {
    const delta = state.heading === null ? 0 : ((value - state.heading + 540) % 360) - 180;
    state.heading = state.heading === null ? value : (state.heading + delta * 0.4 + 360) % 360;
    state.previousFix = { lat, lng, accuracy };
  } else if (!p) state.previousFix = { lat, lng, accuracy };
}
function applyMapOrientation() {
  const course = state.mapOrientation === 'course';
  const vector = state.map?.getRenderingType?.() !== 'RASTER';
  state.map?.setHeading?.(course && vector ? state.heading ?? 0 : 0);
  const button = document.querySelector('#locate');
  if (!button) return;
  const label = state.appLanguage === 'ru'
    ? (course ? 'По ходу движения. Нажмите: север сверху' : 'Север сверху. Нажмите: по ходу движения')
    : (course ? 'Travel direction. Tap for north up' : 'North up. Tap for travel direction');
  button.setAttribute('aria-label', label); button.title = vector ? label : `${label} · ${state.appLanguage === 'ru' ? 'Вращение карты недоступно на этом устройстве' : 'Map rotation unavailable on this device'}`;
  button.setAttribute('aria-pressed', String(!course));
  button.querySelector('svg').style.transform = `rotate(${course && vector ? -(state.heading ?? 0) : 0}deg)`;
}
function toggleMapOrientation() {
  state.followPosition = true;
  state.mapOrientation = state.mapOrientation === 'course' ? 'north' : 'course';
  applyMapOrientation();
  if (state.lastPoint) frameUserPosition();
  else void locateUser().catch(showLocationError);
}
function displayDistance(meters) {
  if (state.units === 'mi') return `${(meters / 1609.344).toFixed(1)} ${state.appLanguage === 'ru' ? 'мили' : 'mi'}`;
  return meters < 1000 ? `${Math.round(meters)} ${state.appLanguage === 'ru' ? 'м' : 'm'}` : `${(meters / 1000).toFixed(1)} ${state.appLanguage === 'ru' ? 'км' : 'km'}`;
}
function renderNearbyList() {
  const sheet = document.querySelector('.walking-sheet'); if (!sheet) return;
  let node = sheet.querySelector('#nearby-list');
  if (!node) { node = document.createElement('section'); node.id = 'nearby-list'; sheet.querySelector('.ambient-row').after(node); }
  const candidates = [...(state.lastResult?.aheadDiscovery?.nearbyCandidates || state.lastResult?.aheadDiscovery?.topCandidates || [])].sort((a,b) => a.distanceMeters - b.distanceMeters).slice(0, state.movementMode === 'vehicle' ? 3 : 6);
  const narration = !!state.audioUrl && !storyAudio.ended;
  sheet.querySelector('.ambient-row').hidden = candidates.length > 0 && !narration && !state.selectedPoi;
  node.hidden = !candidates.length;
  const categories = { city: ['Город','City'], museum: ['Музей','Museum'], historical_landmark: ['Историческое место','Historic landmark'], cultural_landmark: ['Достопримечательность','Landmark'], national_park: ['Национальный парк','National park'], park: ['Парк','Park'], monument: ['Монумент','Monument'], university: ['Университет','University'], region: ['Регион','Region'] };
  node.innerHTML = `<h2>${state.appLanguage === 'ru' ? 'Ближайшие места' : 'Nearby places'}</h2><ul>${candidates.map(c => `<li><button class="nearby-place" data-poi="${esc(c.providerId)}"><span><strong>${esc(c.name)}</strong><small>${esc((categories[c.targetType] || ['Место','Place'])[state.appLanguage === 'ru' ? 0 : 1])}</small></span><span>${displayDistance(c.distanceMeters)}</span></button></li>`).join('')}</ul>`;
  node.querySelectorAll('[data-poi]').forEach(button => button.onclick = () => selectNearbyPlace(button.dataset.poi));
  node.querySelectorAll('[data-poi]').forEach(button => { const selected = button.dataset.poi === state.selectedPoi?.providerId; button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected)); });
  renderSelectedStory();
  if (state.followPosition) frameUserPosition();
}

const activityClientId = globalThis.crypto?.randomUUID?.() || `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
let activityPending = false;
async function sendActivity(forceInactive = false) {
  if (!state.token || activityPending) return;
  activityPending = true;
  try {
    await api('/usage/activity', { method: 'POST', keepalive: true, body: JSON.stringify({ clientId: activityClientId, guideId: state.guide, active: !forceInactive && (!document.hidden || !storyAudio.paused), listening: !storyAudio.paused, listeningGuideId: state.audioGuideId || state.guide }) });
  } catch { /* Analytics must never stop playback or discovery. */ }
  finally { activityPending = false; }
}
setInterval(() => { if (!document.hidden || !storyAudio.paused) void sendActivity(); }, 30000);
document.addEventListener('visibilitychange', () => { void sendActivity(); if (!document.hidden) void loadGuideCatalog(); });
window.addEventListener('pagehide', () => { void sendActivity(true); });
for (const event of ['play', 'pause', 'ended']) storyAudio.addEventListener(event, () => { void sendActivity(); });
void loadGuideCatalog();
void sendActivity();

function durationLabel(seconds) {
  const minutes = Math.round(Number(seconds || 0) / 60);
  return `${Math.floor(minutes / 60)} ${state.appLanguage === 'ru' ? 'ч' : 'h'} ${minutes % 60} ${state.appLanguage === 'ru' ? 'мин' : 'min'}`;
}
async function loadAccountAnalytics(days) {
  const node = document.querySelector('#account-analytics'); if (!node) return;
  try {
    const result = await api(`/admin/accounts?days=${days}`);
    node.innerHTML = `<h2>${state.appLanguage === 'ru' ? 'Использование по аккаунтам' : 'Account activity'}</h2><p>${state.appLanguage === 'ru' ? 'Время: открытое приложение или воспроизведение рассказа. Прослушивание показано отдельно. Исторические данные до обновления отсутствуют.' : 'Time: visible app or story playback. Listening is reported separately. Data before this update is unavailable.'}</p>${result.users.map(user => `<details class="account-detail"><summary><strong>${esc(user.email)}</strong><span>${durationLabel(user.active_seconds)}</span></summary><p>${state.appLanguage === 'ru' ? 'Выбранный гид' : 'Selected guide'}: ${esc(user.selected_guide_id || '—')} · ${state.appLanguage === 'ru' ? 'Чаще всего' : 'Most used'}: ${esc(user.guides?.[0]?.guideId || '—')}</p><div class="table-wrap"><table><thead><tr><th>Гид / Guide</th><th>Время / Time</th><th>Аудио / Audio</th></tr></thead><tbody>${(user.guides || []).map(g => `<tr><td>${esc(g.guideId)}</td><td>${durationLabel(g.seconds)}</td><td>${durationLabel(g.listeningSeconds)}</td></tr>`).join('')}</tbody></table><table><thead><tr><th>API / Model</th><th>Tokens</th><th>USD</th></tr></thead><tbody>${(user.costs || []).filter(c => Number(c.cost) || Number(c.tokens)).map(c => `<tr><td>${esc(c.category)} ${esc(c.model)}</td><td>${Number(c.tokens || 0)}</td><td>$${Number(c.cost).toFixed(4)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}`;
  } catch (error) { node.textContent = error.message; }
}
let adminGuides = [];
async function loadGuideAdmin() {
  const node = document.querySelector('#guide-admin'); if (!node) return;
  try {
    const data = await api('/admin/guides'); adminGuides = data.guides;
    node.innerHTML = `<h2>Гиды / Guides</h2><p>Фото, аватар, описание, характер и голос. Удаление скрывает гида из приложения; история использования сохраняется.</p><div class="admin-guide-list">${adminGuides.map(g => `<button class="secondary" data-edit-guide="${esc(g.id)}"><img src="${esc(guideImageUrl(g.avatar))}" alt=""><span>${esc(g.ru.name)}${g.active ? '' : ' · архив'}</span></button>`).join('')}<button class="secondary" id="add-guide">+ Добавить гида</button></div><div id="guide-editor"></div>`;
    node.querySelectorAll('[data-edit-guide]').forEach(b => b.addEventListener('click', () => drawGuideEditor(adminGuides.find(g => g.id === b.dataset.editGuide))));
    node.querySelector('#add-guide').addEventListener('click', () => drawGuideEditor(null));
  } catch (error) { node.textContent = error.message; }
}
function drawGuideEditor(existing) {
  const node = document.querySelector('#guide-editor');
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: '', active: false, order: adminGuides.length, avatar: '', image: '', voice: 'coral', personality: '', voiceInstructions: '', ru: { name: '', role: '', body: '', interests: [], greeting: '' }, en: { name: '', role: '', body: '', interests: [], greeting: '' } };
  const field = (label, name, value, multiline = false) => `<label>${label}${multiline ? `<textarea name="${name}" rows="3" required>${esc(value)}</textarea>` : `<input name="${name}" value="${esc(value)}" required>`}</label>`;
  node.innerHTML = `<form id="guide-form"><h3>${existing ? esc(existing.ru.name) : 'Новый гид'}</h3><label>ID<input name="id" pattern="[a-z][a-z0-9_-]{1,39}" maxlength="40" value="${esc(draft.id)}" ${existing ? 'readonly' : ''} required></label><label>Порядок<input type="number" name="order" min="-10000" max="10000" value="${draft.order}" required></label><label class="check-label"><input type="checkbox" name="active" ${draft.active ? 'checked' : ''}> Доступен в приложении</label><div class="editor-images">${['image','avatar'].map(kind => `<section><h4>${kind === 'avatar' ? 'Круглый аватар' : 'Главное фото'}</h4><img id="preview-${kind}" class="${kind}" ${draft[kind] ? `src="${esc(guideImageUrl(draft[kind]))}"` : ''} alt="Предпросмотр"><input type="file" data-image-kind="${kind}" accept="image/png,image/jpeg,image/webp"><div id="crop-${kind}"></div></section>`).join('')}</div>${['ru','en'].map(lang => `<fieldset><legend>${lang === 'ru' ? 'Русский' : 'English'}</legend>${field('Имя / Name',lang+'.name',draft[lang].name)}${field('Роль / Role',lang+'.role',draft[lang].role)}${field('Описание / Description',lang+'.body',draft[lang].body,true)}${field('Темы через запятую / Topics',lang+'.interests',draft[lang].interests.join(', '))}${field('Пример голоса / Voice sample',lang+'.greeting',draft[lang].greeting,true)}</fieldset>`).join('')}${field('Характер и манера рассказа (не правила выбора объектов)','personality',draft.personality,true)}<label>Голос OpenAI<select name="voice">${['alloy','echo','fable','onyx','nova','shimmer','coral','sage','ash'].map(v => `<option ${v===draft.voice?'selected':''}>${v}</option>`).join('')}</select></label>${field('Манера речи / Voice direction','voiceInstructions',draft.voiceInstructions,true)}<p id="editor-message" role="status"></p><div class="profile-actions"><button class="primary" type="submit">Сохранить</button>${existing ? '<button class="secondary" type="button" id="archive-guide">Удалить из приложения</button>' : ''}</div></form>`;
  node.querySelectorAll('[data-image-kind]').forEach(input => input.addEventListener('change', () => prepareGuideImage(input.files[0], input.dataset.imageKind, draft)));
  node.querySelector('#archive-guide')?.addEventListener('click', async () => {
    if (!confirm('Скрыть гида из приложения? Статистика сохранится.')) return;
    try { await api(`/admin/guides/${draft.id}`,{method:'DELETE'}); await loadGuideAdmin(); await loadGuideCatalog(); }
    catch(e) { node.querySelector('#editor-message').textContent=e.message; }
  });
  node.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const button = form.querySelector('[type=submit]');
    for(const key of ['id','personality','voiceInstructions','voice']) draft[key] = String(data.get(key)).trim();
    draft.active = data.has('active'); draft.order = Number(data.get('order'));
    for(const lang of ['ru','en']) for(const key of ['name','role','body','greeting','interests']) draft[lang][key] = key === 'interests' ? String(data.get(lang+'.'+key)).split(',').map(s=>s.trim()).filter(Boolean) : String(data.get(lang+'.'+key)).trim();
    button.disabled = true;
    try { await api(`/admin/guides/${draft.id}`,{method:'PUT',body:JSON.stringify(draft)}); await loadGuideCatalog(); await loadGuideAdmin(); document.querySelector('#guide-editor').textContent = 'Сохранено. Изменения доступны в приложении.'; }
    catch(e) { form.querySelector('#editor-message').textContent = e.message; button.disabled = false; }
  });
}
function prepareGuideImage(file, kind, draft) {
  if (!file) return;
  const container = document.querySelector(`#crop-${kind}`);
  if (file.size > 20 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)) { container.textContent = 'Выберите PNG, JPEG или WebP до 20 МБ.'; return; }
  const url = URL.createObjectURL(file); const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    container.innerHTML = `<p>${kind === 'avatar' ? 'Кадрируйте до середины груди, оставив голову целиком.' : 'Главное фото сохраняется целиком.'}</p><canvas width="${kind === 'avatar' ? 512 : Math.min(1200,image.width)}" height="${kind === 'avatar' ? 512 : Math.round(image.height*Math.min(1200/image.width,1800/image.height,1))}"></canvas>${kind === 'avatar' ? '<label>Масштаб<input type="range" data-crop="zoom" min="1" max="4" step="0.01" value="1"></label><label>По горизонтали<input type="range" data-crop="x" min="0" max="1" step="0.01" value="0.5"></label><label>По вертикали<input type="range" data-crop="y" min="0" max="1" step="0.01" value="0"></label>' : ''}<button type="button" class="secondary">Использовать изображение</button><p role="status"></p>`;
    const canvas = container.querySelector('canvas');
    if(kind === 'image') { const scale=Math.min(1200/image.width,1800/image.height,1);canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale); }
    const draw = () => {
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
      if(kind==='avatar') { const val=name=>Number(container.querySelector(`[data-crop=${name}]`).value);const side=Math.min(image.width,image.height)/val('zoom');ctx.drawImage(image,(image.width-side)*val('x'),(image.height-side)*val('y'),side,side,0,0,512,512); }
      else { ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height); }
    };
    container.querySelectorAll('input').forEach(i=>i.addEventListener('input',draw));draw();
    container.querySelector('button').addEventListener('click', async event => {
      const button=event.currentTarget;button.disabled=true;
      try {
        const mime = kind === 'avatar' ? 'image/png' : 'image/jpeg';
        let blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,0.88));
        if(!blob || blob.size>950*1024) throw new Error('Изображение больше 950 КБ. Выберите менее крупное изображение.');
        const result=await api('/admin/guide-image',{method:'POST',headers:{'Content-Type':mime},body:blob});
        draft[kind]=result.path;document.querySelector(`#preview-${kind}`).src=guideImageUrl(result.path);container.innerHTML='<p>Изображение подготовлено. Нажмите «Сохранить» ниже.</p>';
      } catch(e) { container.querySelector('[role=status]').textContent=e.message;button.disabled=false; }
    });
  };
  image.onerror = () => { URL.revokeObjectURL(url);container.textContent='Не удалось прочитать изображение'; };
  image.src=url;
}

// The browser may suspend hidden pages. Keep active exploration visible and
// expose real audio to the OS; never emulate background execution with silence.
let screenLock = null;
let screenLockPending = false;
async function syncScreenLock() {
  const wanted = !!state.sessionId && document.visibilityState === 'visible';
  if (!wanted) {
    const lock = screenLock; screenLock = null;
    if (lock) await lock.release().catch(() => {});
    return;
  }
  if (screenLock || screenLockPending || !navigator.wakeLock) return;
  screenLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!state.sessionId || document.visibilityState !== 'visible') { await lock.release(); return; }
    screenLock = lock;
    lock.addEventListener('release', () => { if (screenLock === lock) screenLock = null; });
  } catch { /* Battery saver or browser policy can deny a wake lock. */ }
  finally { screenLockPending = false; }
}
function syncMediaSession() {
  if (!navigator.mediaSession) return;
  navigator.mediaSession.playbackState = !state.audioUrl ? 'none' : storyAudio.paused ? 'paused' : 'playing';
  if (!state.audioUrl) { navigator.mediaSession.metadata = null; return; }
  if (window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({
    title: state.lastResult?.poi?.name || state.lastResult?.target?.name || 'Hey City',
    artist: guideCopy(state.audioGuideId || state.guide).name, album: 'Hey City',
  });
}
if (navigator.mediaSession) {
  for (const [action, handler] of Object.entries({
    play: () => { if (state.audioUrl) void storyAudio.play().catch(() => {}); },
    pause: () => storyAudio.pause(),
    stop: () => stopWalking(),
  })) { try { navigator.mediaSession.setActionHandler(action, handler); } catch {} }
}
for (const event of ['play', 'pause', 'ended', 'loadedmetadata']) storyAudio.addEventListener(event, syncMediaSession);
document.addEventListener('visibilitychange', () => {
  void syncScreenLock();
  if (document.visibilityState !== 'visible' || !state.sessionId) return;
  const sessionId = state.sessionId;
  navigator.geolocation?.getCurrentPosition(position => {
    if (state.sessionId === sessionId) void updateLocation(position);
  }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
});

function frameUserPosition() {
  if (!state.map || !state.lastPoint) return;
  state.map.setCenter(state.lastPoint);
  const height = document.querySelector('.walking-sheet')?.getBoundingClientRect().height || 0;
  const offset = Math.min(height / 2, innerHeight * .25);
  state.map.panBy?.(0, offset);
  document.querySelector('#radar-scan')?.style.setProperty('--radar-y',`calc(50% - ${offset}px)`);
}
function renderSelectedStory() {
  const selected = state.selectedPoi;
  const sheet = document.querySelector('.walking-sheet');
  if (!sheet) return;
  let controls = sheet.querySelector('#story-levels');
  if (!selected) {controls?.remove();return;}
  sheet.querySelector('.ambient-row').hidden = false;
  sheet.querySelector('#place-title').textContent = selected.name;
  sheet.querySelector('#place-copy').textContent = state.selectedText || '';
  const status = sheet.querySelector('#walk-status');
  if (status) status.textContent = state.selectionStatus;
  if (!controls) {controls=document.createElement('div');controls.id='story-levels';sheet.querySelector('.ambient-row').after(controls);}
  const ru = state.appLanguage === 'ru';
  controls.innerHTML = `<button class="secondary" data-level="short">${ru ? 'Кратко' : 'Brief story'}</button><button class="secondary" data-level="long">${ru ? 'Подробнее' : 'More detail'}</button>`;
  controls.querySelectorAll('[data-level]').forEach(button=>{button.onclick=()=>selectNearbyPlace(selected.providerId,button.dataset.level);});
  if (state.selectedSource) {const link=document.createElement('a');link.href=state.selectedSource;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Wikipedia · CC BY-SA';controls.append(link);}
}
function resetSelectionForLanguage() {
  state.selectionRevision++;state.selectionController?.abort();state.selectingPlace=false;
  state.audioUrl=null;storyAudio.pause();storyAudio.removeAttribute('src');storyAudio.load();
  state.selectedText='';state.selectedSource=null;
  state.selectionStatus=state.appLanguage==='ru'?'Язык изменён. Выберите «Кратко» или «Подробнее».':'Language changed. Choose a story length.';
  if (state.sessionId) void api(`/sessions/${state.sessionId}/guide`,{method:'PUT',body:JSON.stringify({guideId:state.guide,language:state.guideLanguage})}).catch(showLocationError);
}
async function selectNearbyPlace(poiId, level = 'short') {
  if (!state.sessionId) return;
  const pool = state.lastResult?.aheadDiscovery?.nearbyCandidates || state.lastResult?.aheadDiscovery?.topCandidates || [];
  const candidate = pool.find(c=>c.providerId===poiId) || (state.selectedPoi?.providerId===poiId ? state.selectedPoi : null);
  if (!candidate) return;
  const sessionId = state.sessionId;
  const revision = ++state.selectionRevision;
  state.selectionController?.abort();
  const controller = new AbortController(); state.selectionController = controller;
  state.selectingPlace = true; state.selectedPoi = candidate; state.selectedText=''; state.selectedSource=null;
  state.selectionStatus = state.appLanguage === 'ru' ? `Выбрано: ${candidate.name}. ${level === 'identify' ? 'Знакомлю с местом…' : 'Готовлю рассказ…'}` : `Selected: ${candidate.name}. Preparing…`;
  storyAudio.pause(); state.audioUrl=null; storyAudio.removeAttribute('src'); storyAudio.load(); primeStoryAudio();
  renderNearbyList(); renderAudioControl();
  try {
    const result = await api('/sessions/' + sessionId + '/select', {method:'POST',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(35000)]),body:JSON.stringify({poiId,level,language:state.guideLanguage})});
    if (state.sessionId!==sessionId || revision!==state.selectionRevision) return;
    state.audioUrl=result.audioUrl; state.audioGuideId=state.guide; state.selectedText=result.transcriptText;state.selectedSource=result.sourceUrl;
    state.selectionStatus = state.appLanguage === 'ru' ? `${level==='identify' ? 'Знакомство' : level==='short' ? 'Краткий рассказ' : 'Подробный рассказ'}: ${candidate.name}` : `${level}: ${candidate.name}`;
    renderSelectedStory(); renderAudioControl();
    if (result.audioUrl) {storyAudio.src=result.audioUrl; await storyAudio.play().catch(()=>{state.selectionStatus=t('map.tapPlay');renderSelectedStory();});}
    else {state.selectionStatus=state.appLanguage==='ru'?'Текст готов, озвучка недоступна. Нажмите «Кратко» для повтора.':'Text is ready; audio is unavailable. Tap Brief story to retry.';renderSelectedStory();}
  } catch(error) {
    if (state.sessionId!==sessionId || revision!==state.selectionRevision) return;
    state.selectionStatus=error.name==='TimeoutError' ? (state.appLanguage==='ru'?'Подготовка затянулась. Выберите «Кратко», чтобы повторить.':'Preparation timed out. Tap Brief story to retry.') : error.message;
    renderSelectedStory();
  } finally { if (revision===state.selectionRevision) state.selectingPlace=false; }
}

// One short user-initiated priming clip, not a background keep-alive loop.
const primedAudio = new WeakSet();
function primeStoryAudio(audio = storyAudio) {
  if (primedAudio.has(audio) || (audio === storyAudio && state.audioUrl)) return;
  const clip = 'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAgICAgICAgICAgICAgA==';
  audio.src = clip;
  void audio.play().then(() => {
    primedAudio.add(audio);
    // Never clear a real story that arrived while the priming promise resolved.
    if (audio.src === clip) { audio.pause(); audio.removeAttribute('src'); }
  }).catch(() => {});
}
storyAudio.addEventListener('error', () => {
  if (!state.audioUrl) return;
  state.selectionStatus = state.appLanguage === 'ru'
    ? 'Не удалось загрузить аудио. Нажмите «Слушать», чтобы повторить.'
    : 'Audio could not load. Tap Play to retry.';
  showLocationError({message:state.selectionStatus});
  renderAudioControl();
});
