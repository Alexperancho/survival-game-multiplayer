// socket-override.js — fuerza que todas las llamadas a io() vayan al backend y en websocket
(function () {
  var TARGET = (typeof window !== "undefined" && window.SG_SERVER) ? window.SG_SERVER : "";
  if (!TARGET) return;

  function patch() {
    if (!window.io || window.__SG_IO_PATCHED__) return;
    var orig = window.io;

    // Parchea io() para que use siempre TARGET, aunque le pasen otra URL
    window.io = function (url, opts) {
      // Soporta llamadas io(), io(opts) e io(url, opts) ignorando siempre "url"
      if (typeof url === "object" && !opts) {
        opts = url;
      }
      opts = opts || {};
      if (!opts.transports) opts.transports = ["websocket"]; // importante en sitios estáticos
      return orig(TARGET, opts);
    };

    window.__SG_IO_PATCHED__ = true;
    console.log("[SG] Socket.IO override activo →", TARGET);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", patch);
  } else {
    patch();
  }
})();
