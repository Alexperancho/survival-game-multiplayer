// service-worker.js — Survival Game (network-first, no websocket interception)
const VERSION = 'sg-sw-v4';
const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/client.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html'
];

const isSocketRelated = (url) =>
  url.includes('/socket.io/') ||
  url.startsWith('ws:') || url.startsWith('wss:') ||
  url.includes('cdn.socket.io');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === VERSION ? Promise.resolve() : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

// Estrategia "network-first con fallback a cache" para HTML/JS/CSS.
// No cacheamos socket.io ni websockets.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || isSocketRelated(url.href)) {
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(VERSION);
          return (await cache.match(req)) || (await cache.match('/offline.html'));
        })
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        const cache = await caches.open(VERSION);
        return (await cache.match(req)) || Response.error();
      })
  );
});
