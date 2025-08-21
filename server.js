// server.js — Survival Game backend (Express + Socket.IO v4)
// ----------------------------------------------------------
// - Crea y gestiona salas (create/join).
// - Difunde estado de lobby (jugadores, host, ajustes).
// - Permite configurar y arrancar la partida (eventos básicos).
// - CORS preparado para https://survivalgame.fun + localhost.
//
// Requisitos en package.json:
//   "dependencies": {
//     "express": "^4.19.2",
//     "socket.io": "^4.7.5",
//     "cors": "^2.8.5"
//   },
//   "scripts": { "start": "node server.js" }
//
// Node 16+ recomendado (mejor 18+). Puerto: process.env.PORT o 3000.

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

// Muestra la versión de socket.io servidor (útil en logs)
try {
  console.log('Socket.IO server version:', require('socket.io/package.json').version);
} catch (_) {}

const app = express();

// ===== CORS (HTTP) =====
const ALLOWED_ORIGINS = [
  'https://survivalgame.fun',
  'http://localhost:3000',
  process.env.FRONT_ORIGIN || '' // opcional: puedes pasar otro origen por ENV
].filter(Boolean);

app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST'],
  credentials: true
}));

// Rutas de salud
app.get('/', (_req, res) => res.send('Survival Game server up'));
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

const server = http.createServer(app);

// ===== Socket.IO (WS) =====
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ===== Estado en memoria =====
// rooms: { [code]: { code, name, hostId, createdAt, settings, players: Map<socketId, {id,name}> } }
const rooms = new Map();

function genRoomCode() {
  // 5 letras mayúsculas (evita colisiones triviales)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVXYZW23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function ensureRoomCode() {
  let code;
  do { code = genRoomCode(); } while (rooms.has(code));
  return code;
}

function roomSummary(room) {
  return {
    code: room.code,
    name: room.name || '',
    hostId: room.hostId,
    settings: room.settings,
    players: Array.from(room.players.values())
  };
}

function notifyLobby(room) {
  io.to(room.code).emit('lobby-state', roomSummary(room));
}

// Helpers: acepta eventos con nombre alternativo
function onEither(socket, names, handler) {
  names.forEach(n => socket.on(n, handler));
}

// ===== Lógica principal =====
io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  // ========== Crear sala ==========
  onEither(socket, ['create-room', 'createRoom'], (payload = {}) => {
    try {
      const playerName = (payload.playerName || payload.name || 'Player').toString().slice(0, 20);
      const roomName = (payload.roomName || payload.nameRoom || '').toString().slice(0, 40);

      const code = ensureRoomCode();
      const room = {
        code,
        name: roomName,
        hostId: socket.id,
        createdAt: Date.now(),
        settings: {
          seatCount: 4,
          startingLives: 7,
          ...((payload.settings && typeof payload.settings === 'object') ? payload.settings : {})
        },
        players: new Map()
      };

      room.players.set(socket.id, { id: socket.id, name: playerName });
      rooms.set(code, room);

      socket.join(code);

      // Respuestas típicas
      socket.emit('room-created', { roomCode: code, ...roomSummary(room) });
      notifyLobby(room);
      console.log(`Room ${code} created by ${socket.id} (${playerName})`);
    } catch (err) {
      console.error('create-room error', err);
      socket.emit('error-message', { type: 'create-room', message: 'Failed to create room.' });
    }
  });

  // ========== Unirse a sala ==========
  onEither(socket, ['join-room', 'joinRoom'], (payload = {}) => {
    try {
      const playerName = (payload.playerName || payload.name || 'Player').toString().slice(0, 20);
      const code = ((payload.roomCode || payload.code || '') + '').toUpperCase().trim();

      const room = rooms.get(code);
      if (!room) {
        socket.emit('error-message', { type: 'join-room', message: 'Room not found.' });
        return;
      }

      // Límite de asientos si está configurado
      if (room.settings?.seatCount && room.players.size >= room.settings.seatCount) {
        socket.emit('error-message', { type: 'join-room', message: 'Room is full.' });
        return;
      }

      room.players.set(socket.id, { id: socket.id, name: playerName });
      socket.join(code);

      socket.emit('joined-room', { roomCode: code, you: { id: socket.id, name: playerName } });
      io.to(code).emit('player-joined', { id: socket.id, name: playerName });
      notifyLobby(room);

      console.log(`Socket ${socket.id} joined room ${code} as ${playerName}`);
    } catch (err) {
      console.error('join-room error', err);
      socket.emit('error-message', { type: 'join-room', message: 'Failed to join room.' });
    }
  });

  // ========== Configurar sala (host) ==========
  onEither(socket, ['configure', 'apply-settings', 'applySettings'], (payload = {}) => {
    try {
      const code = Array.from(socket.rooms).find(r => rooms.has(r)); // la sala a la que pertenece
      if (!code) return;

      const room = rooms.get(code);
      if (!room) return;
      if (room.hostId !== socket.id) {
        socket.emit('error-message', { type: 'configure', message: 'Only host can configure.' });
        return;
      }

      const newSettings = {};
      if (payload.seatCount) newSettings.seatCount = Math.max(2, Math.min(10, Number(payload.seatCount)));
      if (payload.startingLives) newSettings.startingLives = Math.max(1, Math.min(99, Number(payload.startingLives)));
      room.settings = { ...room.settings, ...newSettings };

      io.to(code).emit('config-updated', room.settings);
      notifyLobby(room);
      console.log(`Room ${code} config updated`, room.settings);
    } catch (err) {
      console.error('configure error', err);
      socket.emit('error-message', { type: 'configure', message: 'Failed to apply settings.' });
    }
  });

  // ========== Iniciar partida (host) ==========
  onEither(socket, ['start', 'start-now', 'start_now', 'startGame'], () => {
    try {
      const code = Array.from(socket.rooms).find(r => rooms.has(r));
      if (!code) return;

      const room = rooms.get(code);
      if (!room) return;
      if (room.hostId !== socket.id) {
        socket.emit('error-message', { type: 'start', message: 'Only host can start.' });
        return;
      }

      io.to(code).emit('game-started', { roomCode: code, startedAt: Date.now() });
      console.log(`Room ${code} started by host ${socket.id}`);
    } catch (err) {
      console.error('start error', err);
      socket.emit('error-message', { type: 'start', message: 'Failed to start game.' });
    }
  });

  // ========== Reenvío genérico de eventos de juego ==========
  // Si tu client emite otros eventos (p.ej. 'play-card'), podemos reenviarlos a la sala.
  // Añade aquí los que necesites (ejemplos):
  onEither(socket, ['play-card', 'playCard'], (data) => {
    const code = Array.from(socket.rooms).find(r => rooms.has(r));
    if (!code) return;
    socket.to(code).emit('card-played', { from: socket.id, ...data });
  });

  onEither(socket, ['next-round', 'nextRound'], () => {
    const code = Array.from(socket.rooms).find(r => rooms.has(r));
    if (!code) return;
    io.to(code).emit('round-next', { ts: Date.now() });
  });

  // ========== Salida ==========
  socket.on('disconnect', (reason) => {
    // El socket puede estar en 0 o 1 sala (nuestro modelo)
    let room;
    for (const r of rooms.values()) {
      if (r.players.has(socket.id)) {
        room = r;
        break;
      }
    }
    if (room) {
      room.players.delete(socket.id);
      io.to(room.code).emit('player-left', { id: socket.id });

      // Si el host se va, asigna nuevo host si hay alguno
      if (room.hostId === socket.id) {
        const [next] = room.players.keys();
        room.hostId = next || null;
      }

      // Si la sala queda vacía, elimínala
      if (room.players.size === 0) {
        rooms.delete(room.code);
        console.log(`Room ${room.code} deleted (empty)`);
      } else {
        notifyLobby(room);
      }
    }
    console.log('Client disconnected', socket.id, reason);
  });
});

// ===== Arranque =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Survival Game server listening on http://0.0.0.0:${PORT}`);
  console.log('Allowed origins:', ALLOWED_ORIGINS.join(', ') || '(none)');
});
