// Caches the app shell so it opens and works offline (all data lives in IndexedDB on-device).
// Receipt scanning still needs a live connection to reach the Claude API.

// Bump this on every release. Also update the matching ?v= query strings on
// the <script>/<link> tags in index.html — that busts Netlify's CDN cache and
// the browser's plain HTTP cache, independent of this service worker's own
// cache-first strategy below (both layers can otherwise serve stale JS/CSS).
const CACHE_NAME = 'write-off-tracker-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css?v=2',
  './app.js?v=2',
  './db.js?v=2',
  './claude.js?v=2',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept calls to the Claude API — those must go live.
  if (url.hostname === 'api.anthropic.com') return;
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      }).catch(() => cached);
    })
  );
});
