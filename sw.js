// rAdio PWA Service Worker
const CACHE_NAME = 'radio-v2.0.7';

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './css/modern.css',
  './css/minimal.css',
  './css/directory.css',
  './css/player.css',
  './css/auth.css',
  './js/app.js',
  './js/metadata-service.js',
  './js/audio-engine.js',
  './js/storage.js',
  './js/auth-manager.js',
  './data/categories.json',
  './data/popular.json',
  './data/cities.json',
  './assets/brand/logo.svg',
  './assets/brand/icon.svg',
  './assets/brand/favicon.svg',
  './assets/brand/apple-touch-icon.png',
  './assets/brand/icon-192.png',
  './assets/brand/icon-512.png'
];

// Install: Cache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell assets');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[Service Worker] Some assets failed to precache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy dispatcher
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. NEVER cache live audio streams or Range requests (m3u8, aac, mp3, livestream)
  if (
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.aac') ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.includes('/abr/') ||
    url.pathname.includes('/playlist') ||
    url.pathname.includes('/livestream') ||
    event.request.headers.get('range') ||
    event.request.destination === 'audio'
  ) {
    return; // Let browser handle live stream directly via network
  }

  // 2. Data JSON files: Stale-While-Revalidate
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

  // 3. Static App Shell: Network-First with Cache Fallback (Ensures fast updates while supporting offline)
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (
        networkResponse &&
        networkResponse.status === 200 &&
        event.request.method === 'GET' &&
        url.origin === self.location.origin
      ) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => {
      // Offline fallback: return cached version
      return caches.match(event.request).then((cachedResponse) => {
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
