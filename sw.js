// rAdio PWA Service Worker
const CACHE_NAME = 'radio-v2.3.0';

// Core same-origin assets to pre-cache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './css/modern.css',
  './css/directory.css',
  './css/player.css',
  './css/auth.css',
  './css/desktop.css',
  './js/app.js',
  './js/desktop-ui.js',
  './js/metadata-service.js',
  './js/audio-engine.js',
  './js/storage.js',
  './data/stations.json',
  './data/categories.json',
  './data/popular.json',
  './assets/brand/logo.svg',
  './assets/brand/icon.svg',
  './assets/brand/favicon.svg',
  './assets/brand/favicon.png',
  './assets/brand/apple-touch-icon.png',
  './assets/brand/icon-192.png',
  './assets/brand/icon-512.png',
  './assets/brand/dmca-contact.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[Service Worker] Some assets failed to precache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept cross-origin audio streams, HLS segments, CDN scripts, or metadata APIs
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache local range/audio requests if any
  if (
    event.request.headers.get('range') ||
    event.request.destination === 'audio' ||
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.aac') ||
    url.pathname.endsWith('.mp3')
  ) {
    return;
  }

  // Data JSON files: Stale-While-Revalidate
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Static App Shell: Network-First with Cache Fallback (ignores query-string version mismatches smoothly)
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
