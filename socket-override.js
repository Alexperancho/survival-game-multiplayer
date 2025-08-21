// socket-override.js
// Fuerza que TODAS las conexiones Socket.IO del front vayan al backend (SG_SERVER)
// y que usen transporte "websocket" (evita long-polling en host estático como GitHub Pages).

(function () {
  const TARGET =
    (typeof window !== "undefined" && window.SG_SERVER) ? window.SG_SERVER : "";

  function patch() {
    if (!TARGET) {
      console.warn("[SG] SG_SERVER no definido en config.js; no se aplica override.");
      return;
    }
    if (!window.io || window.__SG_IO_PATCHED__) return;

    const originalIo = window.io;

    // Sobrescribe io() para ignorar cualquier URL y usar siempre TARGET
    window.io = function (url, opts) {
      // Soporta io(), io(opts) e io(url, opts) — siempre usaremos TARGET
      if (typeof url === "object" && !opts) {
        opts = url;
      }
      opts = opts || {};

      // Fuerza WebSocket para evitar problemas de CORS con long-polling en sitios estáticos
      if (!opts.transports) opts.transports = ["websocket"];

      // Si quieres enviar cookies/autorización entre orígenes, descomenta:
      // opts.withCredentials = true;

      return originalIo(TARGET, opts);
    };

    window.__SG_IO_PATCHED__ = true;
    console.log("[SG] Socket.IO override activo →", TARGET);
  }

  // Intenta aplicar el parche cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", patch);
  } else {
    patch();
  }

  // Reintentos por si el CDN de socket.io entra más tarde
  let tries = 0;
  const timer = setInterval(() => {
    if (window.__SG_IO_PATCHED__ || tries++ > 20) {
      clearInterval(timer);
      return;
    }
    patch();
  }, 250);
})();
