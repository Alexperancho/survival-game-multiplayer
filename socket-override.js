// socket-override.js
(function () {
  // Requiere que el <script> del CDN de Socket.IO esté cargado ANTES.
  if (typeof window.io === 'undefined') {
    console.error('[SG] ERROR: socket.io no está cargado. Asegúrate de incluir el CDN antes de este archivo.');
    return;
  }

  const BASE = window.SG_BACKEND;
  const opts = {
    path: '/socket.io',
    transports: ['websocket'],        // fuerza WS, evita long-polling
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 20000,
    forceNew: true,
  };

  // Crea una instancia única y la expone de forma global si tu client.js la quiere usar.
  const socket = window.io(BASE, opts);

  socket.on('connect', () => {
    console.log('[SG] conectado ✓', { id: socket.id, url: BASE });
  });
  socket.on('connect_error', (err) => {
    console.error('[SG] connect_error', err?.message || err);
  });
  socket.on('disconnect', (reason) => {
    console.warn('[SG] disconnect', reason);
  });

  // Exponerla:
  window.SG_socket = socket;
  console.log('[SG] Socket.IO override activo →', BASE);
})();
