/*
 * Service worker for the School Inspection Suite PWA.
 * Caches the static app shell (HTML/CSS/JS/icons) so the app installs
 * and opens instantly, including offline. API calls to the Apps Script
 * backend are always passed straight through to the network -- they
 * are POST requests (session/data operations) that must never be
 * served from cache, and this worker doesn't intercept them at all.
 */

const CACHE_NAME = 'inspection-suite-v1';
const APP_SHELL = [
  './',
  './index.html',
  './inspection.html',
  './styles.css',
  './app.js',
  './home.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .catch(function (err) { console.warn('SW install cache warning:', err); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const req = event.request;

  // Only ever handle same-origin GET requests for the static shell.
  // Everything else (API POSTs to Apps Script, cross-origin requests)
  // is left completely alone and goes straight to the network.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      const networkFetch = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, clone); });
        }
        return res;
      }).catch(function () { return cached; });
      // Stale-while-revalidate: serve cached instantly if we have it,
      // refresh the cache in the background for next time.
      return cached || networkFetch;
    })
  );
});
