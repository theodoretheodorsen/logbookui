// Hand-written service worker (no Workbox/build step, matching this repo's
// no-bundler philosophy). Two-tier strategy:
//  - CORE_ASSETS: the small, stable set of files needed to boot the app
//    shell at all - precached on install.
//  - everything else (web/js/*.js, lib/*.js, future additions) is cached
//    opportunistically the first time it's actually fetched, so this list
//    never needs to be hand-updated when a new module file is added.
// Cross-origin requests (api.github.com) and non-GET requests are never
// intercepted - logbook data load/save always requires a live network call,
// by design (see README.md). The actual logbook.db bytes are cached
// separately, in IndexedDB - see web/js/offline-cache.js - since that's one
// specific mutable blob rather than a set of static files.

const CACHE_NAME = 'logbook-shell-v1'; // bump the suffix to force-invalidate old caches

const CORE_ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'vendor/sql-wasm.js',
  'vendor/sql-wasm.wasm',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never touch GitHub Contents API writes

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch api.github.com etc.

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('index.html')))
  );
});
