/* socket-override.js
   Fuerza a que todas las llamadas a io() vayan a nuestro backend de Railway
   con opciones seguras para GitHub Pages.
*/
(() => {
  // 1) Comprobaciones básicas
  if (typeof window === 'undefined') return;
  if (!window.io) {
    console.error('[SG] ERROR: socket.io no está cargado. Asegúrate de incluir el CDN antes de este archivo.');
    return;
  }

  const ORIG_IO = window.io;
  const BACKEND = (window.SG_BACKEND || '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(BACKEND)) {
    console.error('[SG] ERROR: SG_BACKEND no está definido o es inválido:', BACKEND);
  } else {
    console.log('[SG] Socket.IO override activo →', BACKEND);
  }

  // 2) Utilidad para mezclar opciones
  const merge = (a, b) => Object.assign({}, a || {}, b || {});

  // 3) Sobrescribe io() para redirigir SIEMPRE al backend
  window.io = function overriddenIo(_unusedUrl, opts) {
    const baseOpts = {
      path: '/socket.io',
      transports: ['websocket'],      // Sólo WebSocket (mejor en Pages)
      upgrade: false,                 // Evita intento de polling→ws
      withCredentials: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 800,
      timeout: 10000,                 // 10s
      forceNew: true,                 // evita reutilizar conexiones rotas
      extraHeaders: {}                // no mandamos cookies
    };
    const finalOpts = merge(baseOpts, opts);
    console.log('[SG] io() redirigido →', BACKEND, finalOpts);
    const socket = ORIG_IO(BACKEND, finalOpts);
    return socket;
  };

  // Compatibilidad por si client.js usa io.connect
  window.io.connect = window.io;

  // 4) Conexión “probe” para visibilidad en consola
  try {
    const probe = ORIG_IO(BACKEND, {
      path: '/socket.io',
      transports: ['websocket'],
      upgrade: false,
      forceNew: true,
      timeout: 8000
    });
    probe.once('connect', () => {
      console.log('[SG] Probe: conectado con éxito');
      probe.close();
    });
    probe.once('connect_error', (err) => {
      console.error('[SG] Probe: connect_error →', err && (err.message || err));
    });
  } catch (e) {
    console.error('[SG] Probe: excepción al conectar →', e);
  }
})();
