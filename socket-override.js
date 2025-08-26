// socket-override.js
// Redirige CUALQUIER llamada a window.io(...) hacia tu backend de Railway,
// y fuerza opciones seguras para producción (solo WebSocket, sin polling).

(function () {
  if (typeof window === 'undefined') return;

  if (typeof window.io === 'undefined') {
    console.error('[SG] ERROR: socket.io no está cargado. Asegúrate de incluir el CDN ANTES de este archivo.');
    return;
  }

  var BASE = window.SG_BACKEND || '';
  if (!BASE) {
    console.error('[SG] ERROR: SG_BACKEND no definido. Asegúrate de cargar config.js antes de este archivo.');
    return;
  }

  var DEFAULT_OPTS = {
    path: '/socket.io',
    transports: ['websocket'],       // Evitamos long-polling
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 20000,
    forceNew: false                  // Deja que se reutilice conexión cuando el cliente lo permita
  };

  function mergeOpts(a, b) {
    var out = {};
    if (a) for (var k in a) out[k] = a[k];
    if (b) for (var k2 in b) out[k2] = b[k2];
    return out;
  }

  // Guardamos la función IO original para llamar internamente sin recursión.
  var originalIo = window.io;

  // 🔧 MONKEY-PATCH GLOBAL
  // Sustituimos window.io por una función que SIEMPRE conecte a BASE.
  window.io = function (arg1, arg2) {
    var url = BASE;
    var opts = DEFAULT_OPTS;

    // Soportamos firmas: io(), io(url), io(opts), io(url, opts)
    if (typeof arg1 === 'string') {
      // Si pasaron un URL relativo o vacío, igualmente forzamos BASE
      url = BASE;
      opts = mergeOpts(DEFAULT_OPTS, arg2);
    } else if (typeof arg1 === 'object' && arg1 !== null) {
      // Firma io(opts)
      opts = mergeOpts(DEFAULT_OPTS, arg1);
    }
    // url queda forzado a BASE

    var sock = originalIo(url, opts);
    sock.on('connect', function () {
      console.log('[SG] (wrapped io) connected', { id: sock.id, url: url });
    });
    sock.on('connect_error', function (e) {
      console.error('[SG] (wrapped io) connect_error', (e && e.message) || e);
    });
    return sock;
  };

  // Además creamos UNA instancia compartida por si tu cliente la quiere reutilizar
  if (!window.SG_socket) {
    window.SG_socket = originalIo(BASE, DEFAULT_OPTS);
    window.SG_socket.on('connect', function () {
      console.log('[SG] conectado ✓', { id: window.SG_socket.id, url: BASE });
    });
    window.SG_socket.on('connect_error', function (e) {
      console.error('[SG] connect_error', (e && e.message) || e);
    });
    window.SG_socket.on('disconnect', function (r) {
      console.warn('[SG] disconnect', r);
    });
  }

  console.log('[SG] Socket.IO override activo →', BASE);
})();
