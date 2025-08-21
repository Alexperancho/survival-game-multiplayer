// config.js
// URL pública de TU backend en Railway (Socket.IO v4)
window.SG_SERVER = "https://survival-game-multiplayer-production.up.railway.app";

// (Opcional) pequeño log para comprobar que el front carga este archivo
(function () {
  try {
    console.log("[SG] Backend apuntando a:", window.SG_SERVER);
  } catch (e) {
    // nada
  }
})();
