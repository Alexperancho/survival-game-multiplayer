/* Survival Game - Service Worker (PWA) */
const CACHE_NAME = 'sg-cache-v1';
const OFFLINE_URL = '/offline.html';

/* Archivos básicos a precachear. Añade aquí otros estáticos si los tienes. */
const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/client.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  OFFLINE_URL
];

/* Instalación: precache básico */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

/* Activación: limpieza de caches viejos */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())))
    )
  );
  self.clients.claim();
});

/* Fetch:
   - Navegación (documentos HTML): red y, si falla, offline.html
   - Otros GET: cache-first y, si no está, red
   - Nota: los WebSockets (wss://) no pasan por el SW  */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo manejamos GET
  if (req.method !== 'GET') return;

  // Navegación (páginas)
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Recursos estáticos
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // Guarda en caché copias de respuestas válidas
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return resp;
      }).catch(() => {
        // Sin red y sin caché → nada que hacer (dejamos fallar)
        return caches.match(OFFLINE_URL);
      });
    })
  );
});
