// config.js
// Expone la URL del backend que usaremos en el cliente.
window.SG_BACKEND = (function () {
  const h = location.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') {
    return 'http://localhost:8080';
  }
  // Producción en Railway:
  return 'https://survival-game-multiplayer-production.up.railway.app';
})();
console.log('[SG] Backend apuntando a:', window.SG_BACKEND);
