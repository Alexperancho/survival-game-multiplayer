// socket-override.js
// Si está definida window.SG_SERVER, forzamos que io() conecte a ese origen
(function () {
  var TARGET = (typeof window !== "undefined" && window.SG_SERVER) ? window.SG_SERVER : "";
  if (!TARGET) return; // sin config => comportamiento por defecto

  var ready = function () {
    if (!window.io) return; // aún no cargó el script de socket.io
    var orig = window.io;
    window.io = function (url, opts) {
      // Permite llamadas io(), io(opts) o io(url, opts)
      if (!url || typeof url === "object") {
        opts = url || {};
        url = TARGET;
      }
      opts = opts || {};
      // Preferimos WebSocket puro (evita long-polling en hosts estáticos)
      if (!opts.transports) opts.transports = ["websocket"];
      return orig(url, opts);
    };
  };

  // Espera a que cargue el script de socket.io y luego parchea
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
