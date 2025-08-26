/* Survival Game — Cliente lobby (Create / Join room) con Socket.IO v4
   Requiere que (1) el CDN de socket.io esté cargado y (2) socket-override.js
   haya definido globalThis.SG_BACKEND y expuesto window.io (parchado).
*/

/* ========= Config ========= */
const BACKEND_URL = (globalThis.SG_BACKEND || 'https://survival-game-multiplayer-production.up.railway.app').replace(/\/$/, '');
const CONNECT_OPTS = {
  transports: ['websocket'],         // evita intentos de polling a survivalgame.fun
  withCredentials: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 2500,
  timeout: 8000                      // timeout de conexión
};

/* ========= Singleton Socket ========= */
let _socket = null;
function getSocket() {
  if (_socket && _socket.connected) return _socket;

  // Siempre reutilizamos el mismo Manager para no abrir 2 conexiones
  if (_socket && !_socket.connected) {
    try { _socket.disconnect(); } catch {}
    _socket = null;
  }

  // window.io viene del CDN; socket-override.js ya lo ha parcheado
  _socket = window.io(BACKEND_URL, CONNECT_OPTS);

  _socket.on('connect', () => {
    sgLog('connect ✓', { id: _socket.id });
  });

  _socket.on('connect_error', (err) => {
    sgWarn('connect_error', err?.message || err);
  });

  _socket.on('disconnect', (reason) => {
    sgWarn('disconnect', reason);
  });

  // ---- Fallbacks de sala (por si falla el ACK) ----
  _socket.on('room:created', (room) => {
    sgLog('evt room:created', room);
    dispatchDom('sg:room-created', { room });
    showRoom(room);
  });

  _socket.on('room:joined', (room) => {
    sgLog('evt room:joined', room);
    dispatchDom('sg:room-joined', { room });
    showRoom(room);
  });

  _socket.on('room:error', (err) => {
    sgWarn('evt room:error', err);
    alertUser('Error: ' + (err?.error || 'unknown'));
  });

  // Eventos útiles para tu lógica (ya los tenías)
  _socket.on('room:player_joined', (p) => dispatchDom('sg:player-joined', p));
  _socket.on('room:player_left',   (p) => dispatchDom('sg:player-left', p));
  _socket.onAny((event, data) => {
    if (String(event).startsWith('game:')) dispatchDom(event, data);
  });

  return _socket;
}

/* ========= Utilidades ========= */
function qs(sel) { return document.querySelector(sel); }
function sgLog(...a) { console.log('[SG]', ...a); }
function sgWarn(...a) { console.warn('[SG]', ...a); }
function alertUser(msg) { try { alert(msg); } catch {} }
function dispatchDom(type, detail) {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}

/** Emite con ACK; si no hay respuesta en X ms, hace fallback al patrón de eventos. */
function emitWithAck(socket, event, data, { timeout = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      sgWarn(`${event} timeout/err => usando fallback eventos`);
      resolve(null); // null => quien llame sabrá que debe esperar eventos
    }, timeout);

    try {
      socket.timeout(timeout).emit(event, data, (err, res) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        if (err || (res && res.ok === false)) {
          const message = err?.message || res?.error || 'unknown';
          return reject(new Error(message));
        }
        resolve(res || { ok: true });
      });
    } catch (e) {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      reject(e);
    }
  });
}

/* ========= UI (Create / Join) ========= */
const $name   = qs('#playerName');
const $rname  = qs('#roomName');
const $rcode  = qs('#roomCode');
const $btnNew = qs('#createRoomBtn');
const $btnIn  = qs('#joinRoomBtn');
const $lang   = qs('#langSelect'); // si existe

// Precarga desde localStorage
try {
  const saved = JSON.parse(localStorage.getItem('sg:prefs') || '{}');
  if (saved.name)  $name && ($name.value = saved.name);
  if (saved.lang)  $lang && ($lang.value = saved.lang);
  if (saved.rname) $rname && ($rname.value = saved.rname);
} catch {}

function savePrefs() {
  try {
    localStorage.setItem('sg:prefs', JSON.stringify({
      name:  $name?.value || '',
      lang:  $lang?.value || 'EN',
      rname: $rname?.value || ''
    }));
  } catch {}
}

async function onCreateRoomClick() {
  const playerName = ($name?.value || '').trim();
  const roomName   = ($rname?.value || '').trim();
  const lang       = ($lang?.value || 'EN').trim().toUpperCase();

  if (!playerName) return alertUser('Please enter your name');

  savePrefs();
  const socket = getSocket();

  try {
    const res = await emitWithAck(socket, 'create_room', { playerName, roomName, lang }, { timeout: 3500 });
    if (res && res.ok && res.room) {
      sgLog('create_room ACK ✓', res.room);
      showRoom(res.room);
    } else {
      // No ACK => esperamos a fallback event (room:created)
      sgLog('Esperando evento room:created…');
    }
  } catch (e) {
    sgWarn('create_room error', e?.message || e);
    alertUser('Error creating room: ' + (e?.message || e));
  }
}

async function onJoinRoomClick() {
  const playerName = ($name?.value || '').trim();
  const roomCode   = ($rcode?.value || '').trim().toUpperCase();
  const lang       = ($lang?.value || 'EN').trim().toUpperCase();

  if (!playerName) return alertUser('Please enter your name');
  if (!roomCode)   return alertUser('Please enter a room code');

  savePrefs();
  const socket = getSocket();

  try {
    const res = await emitWithAck(socket, 'join_room', { playerName, roomCode, lang }, { timeout: 3500 });
    if (res && res.ok && res.room) {
      sgLog('join_room ACK ✓', res.room);
      showRoom(res.room);
    } else {
      sgLog('Esperando evento room:joined…');
    }
  } catch (e) {
    sgWarn('join_room error', e?.message || e);
    alertUser('Error joining room: ' + (e?.message || e));
  }
}

// Enlaza botones si existen
$btnNew && ($btnNew.onclick = onCreateRoomClick);
$btnIn  && ($btnIn.onclick  = onJoinRoomClick);

/* ========= Render mínimo de sala =========
   No toca tu lógica de juego: sólo navega visualmente y emite
   un evento DOM que puedes usar para arrancar el tablero, etc.
*/
function showRoom(room) {
  if (!room || !room.code) return;
  sgLog('showRoom →', room.code, room);

  // Evento para que otros scripts (tu lógica existente) inicien el juego
  dispatchDom('sg:room-ready', { room });

  // Ejemplo: actualiza URL con hash (opcional)
  try {
    const url = new URL(location.href);
    url.hash = `#${room.code}`;
    history.replaceState(null, '', url.toString());
  } catch {}
}

// Conexión temprana (opcional)
getSocket();
sgLog('Backend:', BACKEND_URL);
