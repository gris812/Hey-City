const config = window.HEY_CITY_CONFIG || {};
const persistedToken = localStorage.getItem('heyCityToken') || sessionStorage.getItem('heyCityToken');
const storedUser = localStorage.getItem('heyCityUser') || sessionStorage.getItem('heyCityUser');
const state = {
  token: persistedToken,
  user: storedUser ? JSON.parse(storedUser) : null,
  tab: location.pathname === '/admin' ? 'admin' : 'map',
  sessionId: null, watchId: null, map: null, mapLoadPromise: null, marker: null, candidateMarkers: [], profile: null, audioUrl: null,
  contextInFlight: false, initialScanComplete: false, starting: false, locationPromise: null, runId: 0,
  lastPoint: null, lastResult: null, walkStatus: '', movementMode: 'walking', speedKmh: null,
  guide: localStorage.getItem('heyCityGuide') || 'dana',
  appLanguage: localStorage.getItem('heyCityLanguage') || 'ru',
  guideLanguage: localStorage.getItem('heyCityGuideLanguage') || 'ru',
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
function movementMetaLabel() { return Number.isFinite(state.speedKmh) ? t('map.speed', { speed: Math.round(state.speedKmh) }) : t('map.gps'); }

const guides = {
  dana: { avatar: '/assets/dana-v3-avatar.png', image: '/assets/dana-v3-profile.png', ru: { name: 'Dana', role: 'Городской проводник', body: 'Живая, наблюдательная и любопытная. Dana замечает характер города, локальную жизнь и детали, мимо которых легко пройти.', interests: ['Скрытые места', 'Локальная жизнь', 'Атмосфера'], greeting: 'Привет! Я Dana. Будем идти в вашем ритме — я заговорю, когда рядом появится место, которое действительно стоит заметить.' }, en: { name: 'Dana', role: 'City companion', body: 'Lively, observant and curious. Dana notices the city’s character, local life and details that are easy to walk past.', interests: ['Hidden gems', 'Local life', 'Atmosphere'], greeting: 'Hi! I’m Dana. We’ll move at your pace, and I’ll speak when something nearby is genuinely worth noticing.' } },
  arthur: { avatar: '/assets/arthur-v3-avatar.png', image: '/assets/arthur-v3-profile.png', ru: { name: 'Arthur', role: 'Историк', body: 'Структурный, точный и внимательный. Arthur объясняет город через историю, архитектуру и решения людей.', interests: ['История', 'Архитектура', 'Контекст'], greeting: 'Здравствуйте. Я Arthur. Вместе мы увидим, как история, архитектура и человеческие решения сформировали город вокруг нас.' }, en: { name: 'Arthur', role: 'Historian', body: 'Structured, precise and attentive. Arthur explains the city through history, architecture and human decisions.', interests: ['History', 'Architecture', 'Context'], greeting: 'Hello. I’m Arthur. Together we’ll see how history, architecture and human decisions shaped the city around us.' } },
};
function guideCopy(id = state.guide) { return { ...guides[id], ...guides[id][state.appLanguage] }; }
const storyAudio = new Audio();
storyAudio.preload = 'auto';
storyAudio.crossOrigin = 'anonymous';
storyAudio.addEventListener('play', updateAudioControl);
storyAudio.addEventListener('pause', updateAudioControl);
storyAudio.addEventListener('ended', updateAudioControl);
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
  const response = await fetch(`${config.apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith('/auth/') && requestToken && state.token === requestToken) {
    const email = state.user?.email || '';
    const message = state.appLanguage === 'ru' ? 'Срок входа истёк. Войдите снова, чтобы начать прогулку. Ваши настройки сохранены.' : 'Your sign-in expired. Sign in again to start exploring. Your settings are saved.';
    logout();
    document.querySelector('#email').value = email;
    document.querySelector('#auth-message').textContent = message;
    throw new Error(message);
  }
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
function logout() { stopWalking(false); localStorage.removeItem('heyCityToken'); localStorage.removeItem('heyCityUser'); sessionStorage.removeItem('heyCityToken'); sessionStorage.removeItem('heyCityUser'); state.token = null; state.user = null; state.profile = null; state.map = null; state.mapLoadPromise = null; state.marker = null; state.tab = 'map'; setPath('/'); render(); }

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
        state.token = result.token; state.user = result.user; localStorage.setItem('heyCityToken', state.token); localStorage.setItem('heyCityUser', JSON.stringify(state.user)); state.tab = state.user.role === 'admin' && location.pathname === '/admin' ? 'admin' : 'map'; render();
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
    <header class="map-header"><button class="icon-button" id="open-menu" aria-label="${t('nav.settings')}">${icon('menu')}</button><div class="walking-status ${walking ? 'is-live' : ''}"><i></i><span id="top-status">${walking ? movementModeLabel() : t('map.mode')}</span></div><button class="guide-avatar" id="open-guide" aria-label="${guide.name}"><img src="${guide.avatar}" alt=""></button></header>
    <button class="map-locate" id="locate" aria-label="${t('map.locate')}">${icon('locate')}</button>
    <article class="walking-sheet"><div class="sheet-handle"></div><div class="sheet-kicker"><span id="walk-status">${esc(walking ? state.walkStatus : t('map.ready'))}</span><span class="area-label">${walking ? movementMetaLabel() : t('map.nearby')}</span></div><div class="ambient-row"><img class="ambient-avatar" src="${guide.avatar}" alt="${guide.name}"><div><h1 id="place-title">${esc(lastTitle || t('map.listening'))}</h1><p id="place-copy">${esc(lastCopy || t('map.copy', { guide: guide.name }))}</p></div></div><div class="story-audio" id="story-audio" ${state.audioUrl ? '' : 'hidden'}><button class="audio-button" id="audio-toggle">${icon('play')}<span>${storyAudio.paused ? t('map.play') : t('map.pause')}</span></button></div><div class="sheet-actions"><button class="primary" id="start-walk" ${walking ? 'hidden' : ''}>${t('map.start')}</button><button class="secondary" id="stop-walk" ${walking ? '' : 'hidden'}>${t('map.stop')}</button></div></article>`, 'map');
  if (mountedMap) {
    document.querySelector('#start-walk').addEventListener('click', startWalking); document.querySelector('#stop-walk').addEventListener('click', stopWalking); document.querySelector('#locate').addEventListener('click', () => { void locateUser().catch(showLocationError); }); document.querySelector('#open-menu').addEventListener('click', () => navigate('settings')); document.querySelector('#open-guide').addEventListener('click', () => openGuideProfile(state.guide)); document.querySelector('#audio-toggle')?.addEventListener('click', toggleStoryAudio);
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
    state.map = new google.maps.Map(mapNode, { center: state.lastPoint || { lat: 40.7128, lng: -74.006 }, zoom: 15, disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy', styles: LIGHT_MAP_STYLES });
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
  state.lastPoint = { lat, lng };
  state.map?.setCenter(state.lastPoint);
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
  state.starting = true;
  const runId = ++state.runId;
  try {
    const position = await locateUser();
    if (runId !== state.runId) return;
    const result = await api('/sessions/start', { method: 'POST', body: JSON.stringify({ mode: 'walking', autoMode: true, themeTags: ['mixed'], narrationStyle: 'documentary', lengthSec: 90, leadTimeMin: 2, voiceId: state.guide === 'arthur' ? 'artur' : 'dana', language: state.guideLanguage, autoplay: true }) });
    if (runId !== state.runId) { void api(`/sessions/${result.sessionId}/end`, { method: 'POST', body: '{}' }).catch(() => {}); return; }
    state.sessionId = result.sessionId;
    state.initialScanComplete = false;
    state.walkStatus = t('map.searching');
    state.watchId = navigator.geolocation.watchPosition((fix) => {
      if (runId === state.runId) void updateLocation(fix);
    }, (error) => {
      if (runId !== state.runId) return;
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
  const { latitude: lat, longitude: lng, heading, speed, accuracy } = position.coords; const point = { lat, lng }; const measuredSpeedKmh = Math.max(0, (speed ?? 0) * 3.6); state.speedKmh = measuredSpeedKmh; applyPosition(position);
  if (state.contextInFlight) return;
  state.contextInFlight = true;
  const initialScan = !state.initialScanComplete;
  if (initialScan) setRadarScanning(true);
  try {
    const result = await api(`/sessions/${state.sessionId}/context`, { method: 'POST', body: JSON.stringify({ lat, lng, heading: heading ?? 0, speed: measuredSpeedKmh, accuracyMeters: accuracy, timestamp: Date.now() }) });
    if (state.sessionId !== sessionId) return;
    state.lastResult = result; state.movementMode = result.mode === 'vehicle' ? 'vehicle' : 'walking'; state.speedKmh = Number.isFinite(result.speedKmh) ? result.speedKmh : measuredSpeedKmh; state.walkStatus = result.nextAction === 'PLAY' ? t('map.speaking', { guide: guideCopy().name }) : t('map.listening');
    if (result.aheadDiscovery?.providerRefresh?.errorCode) {
      state.walkStatus = state.appLanguage === 'ru' ? 'Поиск объектов недоступен. Попробуйте позже.' : 'Place search is unavailable. Try again later.';
    }
    renderCandidateMarkers(result.aheadDiscovery?.topCandidates || []);
    const title = result.poi?.name || result.target?.name || result.decision?.poiName; const statusNode = document.querySelector('#walk-status'); const titleNode = document.querySelector('#place-title'); const copyNode = document.querySelector('#place-copy'); const modeNode = document.querySelector('#top-status'); const metaNode = document.querySelector('.area-label'); if (statusNode) statusNode.textContent = state.walkStatus; if (modeNode) modeNode.textContent = movementModeLabel(); if (metaNode) metaNode.textContent = movementMetaLabel(); if (title && titleNode) titleNode.textContent = title; if (result.transcriptText && copyNode) copyNode.textContent = result.transcriptText;
    if (result.audioUrl && result.nextAction === 'PLAY') { state.audioUrl = result.audioUrl; storyAudio.src = result.audioUrl; renderAudioControl(); storyAudio.play().catch(() => { state.walkStatus = t('map.tapPlay'); if (statusNode) statusNode.textContent = state.walkStatus; updateAudioControl(); }); }
  } catch (error) { if (state.sessionId !== sessionId) return; state.walkStatus = error.message; const statusNode = document.querySelector('#walk-status'); if (statusNode) statusNode.textContent = state.walkStatus; }
  finally { if (state.sessionId !== sessionId) return; state.contextInFlight = false; if (initialScan) { state.initialScanComplete = true; setRadarScanning(false); } }
}

function setRadarScanning(scanning) {
  const radar = document.querySelector('#radar-scan');
  if (radar) radar.hidden = !scanning;
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
function updateAudioControl() { renderAudioControl(); }
function toggleStoryAudio() { if (!state.audioUrl) return; if (storyAudio.paused) storyAudio.play().catch(() => {}); else storyAudio.pause(); }
function stopWalking(refresh = true) { state.runId++; state.starting = false; if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId); state.watchId = null; if (state.sessionId) api(`/sessions/${state.sessionId}/end`, { method: 'POST', body: '{}' }).catch(() => {}); state.sessionId = null; state.contextInFlight = false; state.initialScanComplete = false; state.movementMode = 'walking'; state.speedKmh = null; setRadarScanning(false); clearCandidateMarkers(); state.walkStatus = t('map.ready'); state.audioUrl = null; storyAudio.pause(); storyAudio.removeAttribute('src'); if (refresh && state.tab === 'map') render(); }

function storiesView() {
  const historyItems = state.profile?.history || [];
  shell(`<div class="page stories-page"><div class="page-heading"><div><div class="eyebrow">${t('stories.eyebrow')}</div><h1>${t('stories.title')}</h1></div><span class="count">${t('stories.count', { count: historyItems.length })}</span></div>${historyItems.length ? `<div class="story-list">${historyItems.map((item, index) => `<article class="story-item"><div class="story-index">${String(index + 1).padStart(2, '0')}</div><div><strong>${esc(item.placeId || t('stories.item'))}</strong><p>${new Date(item.completedAt || item.timestamp).toLocaleDateString(state.appLanguage)}</p></div></article>`).join('')}</div>` : `<div class="story-empty"><div class="story-photo"><img src="/assets/trinity-church.webp" alt="City street"><span>${t('stories.future')}</span></div><h2>${t('stories.emptyTitle')}</h2><p>${t('stories.emptyCopy')}</p><button class="primary" id="first-walk">${t('stories.first')}</button></div>`}</div>`, 'stories');
  document.querySelector('#first-walk')?.addEventListener('click', () => navigate('map')); if (!state.profile) loadProfileAndRefresh('stories');
}

function settingsView() {
  const selected = guideCopy();
  shell(`<div class="page settings-page"><header class="settings-sticky"><div class="eyebrow">${t('settings.eyebrow')}</div><h1>${t('settings.title')}</h1></header><section class="settings-section account-line"><div><span class="section-label">${t('settings.account')}</span><strong>${esc(state.user?.email)}</strong></div><button class="text-button" id="logout">${t('settings.logout')}</button></section>
    <section class="settings-section"><div class="section-head"><div><span class="section-label">${t('settings.guide')}</span><h2>${t('settings.leads', { guide: selected.name })}</h2></div><span class="section-note">${t('settings.fullProfile')}</span></div><div class="guide-grid">${Object.keys(guides).map((id) => { const guide = guideCopy(id); return `<button class="guide-card ${state.guide === id ? 'selected' : ''}" data-guide="${id}"><img src="${guide.image}" alt="${guide.name}"><span><strong>${guide.name}</strong><small>${guide.role}</small></span></button>`; }).join('')}</div></section>
    <section class="settings-section settings-table"><div><span class="section-label">${t('settings.appLanguage')}</span><div class="segmented"><button data-language="ru" class="${state.appLanguage === 'ru' ? 'selected' : ''}">Русский</button><button data-language="en" class="${state.appLanguage === 'en' ? 'selected' : ''}">English</button></div></div><div><span class="section-label">${t('settings.guideLanguage')}</span><div class="segmented"><button data-guide-language="ru" class="${state.guideLanguage === 'ru' ? 'selected' : ''}">Русский</button><button data-guide-language="en" class="${state.guideLanguage === 'en' ? 'selected' : ''}">English</button></div></div><div><span class="section-label">${t('settings.privacy')}</span><p>${state.profile?.historyEnabled === false ? t('settings.historyOff') : t('settings.historyOn')}</p></div></section>
    ${state.user?.role === 'admin' ? `<section class="settings-section account-line"><div><span class="section-label">${t('settings.admin')}</span><strong>${t('settings.stats')}</strong></div><button class="text-button" id="open-admin">${t('settings.open')}</button></section>` : ''}<footer class="settings-footer">Hey City WebApp · beta</footer></div>`, 'settings');
  document.querySelector('#logout').addEventListener('click', logout); document.querySelector('#open-admin')?.addEventListener('click', () => navigate('admin')); document.querySelectorAll('[data-guide]').forEach((button) => button.addEventListener('click', () => openGuideProfile(button.dataset.guide))); document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => { state.appLanguage = button.dataset.language; localStorage.setItem('heyCityLanguage', state.appLanguage); state.walkStatus = state.watchId === null ? t('map.ready') : t('map.listening'); settingsView(); })); document.querySelectorAll('[data-guide-language]').forEach((button) => button.addEventListener('click', () => { state.guideLanguage = button.dataset.guideLanguage; localStorage.setItem('heyCityGuideLanguage', state.guideLanguage); api('/me', { method: 'PUT', body: JSON.stringify({ driveDiscovery: { languageDefault: state.guideLanguage } }) }).catch(() => {}); settingsView(); })); if (!state.profile) loadProfileAndRefresh('settings');
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
    document.body.insertAdjacentHTML('beforeend', `<div class="guide-profile" id="guide-profile" role="dialog" aria-modal="true" aria-label="${guide.name}"><div class="profile-photo"><img src="${guide.image}" alt="${guide.name}"><button class="profile-back" id="close-profile" aria-label="Back">${icon('back')}</button><span class="swipe-hint">${t('guide.swipe')}</span></div><div class="profile-content"><div class="profile-title"><div><h1>${guide.name}</h1><span>${guide.role}</span></div><code>${activeGuide === 'dana' ? '01' : '02'} / 02</code></div><p>${guide.body}</p><div class="interest-line">${guide.interests.join(' · ')}</div><button class="voice-sample" id="voice-sample">${icon('play')}<span><strong>${t('guide.voice')}</strong><small>${t('guide.voicePlaceholder')}</small></span></button><blockquote id="voice-copy" hidden>${guide.greeting}</blockquote><div class="profile-actions"><button class="primary" id="choose-guide">${t('guide.choose', { guide: guide.name })}</button><button class="text-button" id="switch-guide">${t('guide.other')}</button></div></div></div>`);
    document.querySelector('#close-profile').addEventListener('click', closeGuideProfile); document.querySelector('#voice-sample').addEventListener('click', async (event) => { const button = event.currentTarget; const copy = document.querySelector('#voice-copy'); copy.hidden = false; if (sampleAudio.src && sampleAudio.dataset.guide === activeGuide && sampleAudio.dataset.lang === state.guideLanguage) { if (sampleAudio.paused) await sampleAudio.play().catch(() => {}); else sampleAudio.pause(); return; } button.querySelector('small').textContent = t('guide.voiceLoading'); button.disabled = true; try { const result = await api('/stories/voice-sample', { method: 'POST', body: JSON.stringify({ voiceId: activeGuide === 'arthur' ? 'artur' : 'dana', lang: state.guideLanguage }) }); sampleAudio.src = result.audioUrl; sampleAudio.dataset.guide = activeGuide; sampleAudio.dataset.lang = state.guideLanguage; await sampleAudio.play(); } catch (error) { button.querySelector('small').textContent = error.message; } finally { button.disabled = false; } }); document.querySelector('#switch-guide').addEventListener('click', () => { sampleAudio.pause(); activeGuide = activeGuide === 'dana' ? 'arthur' : 'dana'; draw(); }); document.querySelector('#choose-guide').addEventListener('click', () => { state.guide = activeGuide; localStorage.setItem('heyCityGuide', activeGuide); closeGuideProfile(); render(); });
    let startX = null; const modal = document.querySelector('#guide-profile'); modal.addEventListener('touchstart', (event) => { startX = event.touches[0].clientX; }, { passive: true }); modal.addEventListener('touchend', (event) => { if (startX !== null && Math.abs(event.changedTouches[0].clientX - startX) > 60) { activeGuide = activeGuide === 'dana' ? 'arthur' : 'dana'; draw(); } }, { passive: true });
  };
  draw();
}

function closeGuideProfile() { sampleAudio.pause(); document.querySelector('#guide-profile')?.remove(); }

async function adminView() {
  if (state.user?.role !== 'admin') { navigate('settings'); return; }
  shell(`<div class="page admin-page"><header class="admin-head"><div><div class="eyebrow">Hey City · operations</div><h1>${t('admin.title')}</h1></div><div class="admin-actions"><button class="text-button" id="admin-back">${t('admin.back')}</button><button class="text-button" id="admin-logout">${t('settings.logout')}</button><select class="period" id="period"><option value="7">${t('admin.days', { count: 7 })}</option><option value="30" selected>${t('admin.days', { count: 30 })}</option><option value="90">${t('admin.days', { count: 90 })}</option></select></div></header><div id="admin-data" class="empty">…</div></div>`, '');
  document.querySelector('#admin-back').addEventListener('click', () => navigate('map')); document.querySelector('#admin-logout').addEventListener('click', logout); document.querySelector('#period').addEventListener('change', loadAdmin); await loadAdmin();
}

async function loadAdmin() {
  const node = document.querySelector('#admin-data'); if (!node) return;
  try {
    const days = document.querySelector('#period')?.value || 30; const [summary, list] = await Promise.all([api(`/admin/summary?days=${days}`), api('/admin/users')]); const totals = summary.totals || []; const matching = (category, operation) => totals.filter((item) => item.category === category && (!operation || item.operation === operation)); const value = (category, field = 'quantity', operation) => matching(category, operation).reduce((sum, item) => sum + Number(item[field] || 0), 0); const categoryCost = (category, operation) => value(category, 'estimated_cost_usd', operation); const cost = totals.reduce((sum, item) => sum + Number(item.estimated_cost_usd || 0), 0); const textTokens = value('openai_text', 'input_tokens') + value('openai_text', 'output_tokens'); const voiceTokens = value('openai_tts', 'input_tokens') + value('openai_tts', 'output_tokens'); const tokens = textTokens + voiceTokens; const googleCost = categoryCost('google_maps');
    const costRow = (label, category, operation, tokenCount = null) => `<div><span>${label}</span><code>${value(category, 'quantity', operation)} ${t('admin.calls')}${tokenCount === null ? '' : ` · ${tokenCount} tokens`}</code><b>$${categoryCost(category, operation).toFixed(4)}</b></div>`;
    node.className = ''; node.innerHTML = `<section class="metrics"><div class="metric"><b>${summary.users}</b><span>${t('admin.users')}</span></div><div class="metric"><b>${summary.activeUsers}</b><span>${t('admin.active')}</span></div><div class="metric"><b>${value('product', 'quantity', 'object_viewed')}</b><span>${t('admin.objects')}</span></div><div class="metric"><b>${tokens}</b><span>${t('admin.tokens')}</span></div><div class="metric"><b>$${googleCost.toFixed(2)}</b><span>${t('admin.googleGross')}</span></div><div class="metric"><b>$${cost.toFixed(2)}</b><span>${t('admin.total')}</span></div></section><section class="cost-breakdown"><h2>${t('admin.breakdown')}</h2>${costRow(t('admin.mapLoads'), 'google_maps', 'dynamic_map_load')}${costRow(t('admin.nearby'), 'google_maps', 'places_nearby_new')}${costRow(t('admin.geocoding'), 'google_maps', 'reverse_geocoding')}${costRow(t('admin.textAi'), 'openai_text', null, textTokens)}${costRow(t('admin.voiceAi'), 'openai_tts', null, voiceTokens)}</section><p class="footnote">${state.appLanguage === 'ru' ? 'Новая диагностика: попытки определения района / ошибки' : 'New diagnostics: area attempts / errors'}: ${value('product', 'quantity', 'reverse_geocoding_attempt')} / ${value('product', 'quantity', 'reverse_geocoding_error')}. ${state.appLanguage === 'ru' ? 'Попытки поиска объектов / ошибки' : 'Place search attempts / errors'}: ${value('product', 'quantity', 'places_nearby_new_attempt')} / ${value('product', 'quantity', 'places_nearby_new_error')}. ${state.appLanguage === 'ru' ? 'Исторические суммы не пересчитаны; новые ошибки исключены из оценки успешных вызовов.' : 'Historical totals unchanged; new errors excluded from successful-call estimates.'}</p><div class="table-wrap"><table><thead><tr><th>${t('admin.email')}</th><th>${t('admin.lastSession')}</th><th>${t('admin.objects')}</th><th>${t('admin.tokens')}</th><th>${t('admin.cost')}</th></tr></thead><tbody>${list.users.map((user) => `<tr><td>${esc(user.email)}</td><td>${new Date(user.last_seen_at).toLocaleString(state.appLanguage)}</td><td>${user.objects_viewed}</td><td>${user.tokens}</td><td>$${Number(user.estimated_cost_usd).toFixed(4)}</td></tr>`).join('')}</tbody></table></div><p class="footnote">${t('admin.note')}</p>`;
  } catch (error) { node.className = 'message'; node.textContent = error.message; }
}

function render() { closeGuideProfile(); if (!state.token) return loginView(); if (state.tab === 'admin') return void adminView(); if (state.tab === 'stories') return storiesView(); if (state.tab === 'settings') return settingsView(); return mapView(); }
window.addEventListener('popstate', () => { state.tab = location.pathname === '/admin' ? 'admin' : 'map'; render(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js');
render();
