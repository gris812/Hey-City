const CACHE = 'hey-city-shell-v7';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/config.js', '/manifest.webmanifest', '/assets/dana.webp', '/assets/arthur.webp', '/assets/trinity-church.webp'];
self.addEventListener('install', (event) => event.waitUntil(Promise.all([
  caches.open(CACHE).then((cache) => cache.addAll(SHELL)),
  self.skipWaiting(),
])));
self.addEventListener('activate', (event) => event.waitUntil(Promise.all([
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  self.clients.claim(),
])));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
