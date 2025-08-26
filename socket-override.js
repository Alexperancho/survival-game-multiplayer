// socket-override.js
(function () {
  const BACKEND = (window.SG_BACKEND || "https://survival-game-multiplayer-production.up.railway.app").replace(/\/+$/, "");
  const DEFAULT_PATH = window.SG_SOCKET_PATH || "/socket.io";
  const DEFAULT_OPTS = Object.assign(
    {
      path: DEFAULT_PATH,
      transports: ["websocket"],
      upgrade: false,
      withCredentials: false
    },
    window.SG_SOCKET_OPTS || {}
  );

  if (!window.io) {
    console.error("[SG] ERROR: socket.io no está cargado (window.io undefined). Carga la librería antes de este archivo.");
    return;
  }

  const ioOriginal = window.io;

  // Reemplazamos window.io para que SIEMPRE apunte a nuestro backend,
  // aunque client.js llame io() sin argumentos o con los suyos.
  window.io = function (...args) {
    const hasUrl = typeof args[0] === "string";
    const userOpts = hasUrl ? (args[1] || {}) : (args[0] || {});
    const finalOpts = Object.assign({}, userOpts, DEFAULT_OPTS);

    const url = BACKEND; // forzamos nuestro backend
    const socket = ioOriginal(url, finalOpts);

    try {
      console.log("[SG] Socket.IO override activo →", url);
      socket.on && socket.on("connect", () => console.log("[SG] conectado ✓"));
      socket.on && socket.on("connect_error", (e) =>
        console.error("[SG] connect_error", e && (e.message || e))
      );
      socket.on && socket.on("reconnect_attempt", (n) =>
        console.warn("[SG] reconnect_attempt", n)
      );
    } catch (_) {}

    return socket;
  };
})();
