/**
 * Survival Game — Socket.IO v4 backend
 * Compatible con cliente que emite: 'create_room' y 'join_room'
 * Responde SIEMPRE por ACK y también emite eventos 'room:*' (fallback)
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ORIGINS = [
  'https://survivalgame.fun',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGINS, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  allowEIO3: false
});

// Respuesta simple para health-check
app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Survival Game server up');
});

// ---- Estado en memoria ----
/** rooms: Map<roomCode, { name, lang, players: Map<socketId, {name}>, createdAt }> */
const rooms = new Map();

function genRoomCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I
  let out = '';
  while (out.length < len) {
    const b = crypto.randomBytes(1)[0] % alphabet.length;
    out += alphabet[b];
  }
  return out;
}

function safeRoomSnapshot(code) {
  const r = rooms.get(code);
  if (!r) return null;
  return {
    code,
    name: r.name,
    lang: r.lang,
    players: Array.from(r.players.entries()).map(([id, p]) => ({ id, name: p.name })),
    createdAt: r.createdAt
  };
}

io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  // ---- Crear sala ----
  socket.on('create_room', (payload = {}, ack) => {
    try {
      const playerName = String(payload.playerName || '').trim();
      const roomName   = String(payload.roomName   || '').trim();
      const lang       = String(payload.lang       || 'EN').trim().toUpperCase();

      if (!playerName) throw new Error('MISSING_PLAYER_NAME');

      let code;
      do { code = genRoomCode(6); } while (rooms.has(code));

      const room = {
        name: roomName || 'Room',
        lang,
        players: new Map(),
        createdAt: Date.now()
      };
      rooms.set(code, room);

      // Une al creador
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.playerName = playerName;
      room.players.set(socket.id, { name: playerName });

      const snapshot = safeRoomSnapshot(code);

      // 1) ACK
      if (typeof ack === 'function') {
        ack({ ok: true, room: snapshot });
      }
      // 2) Fallback por evento
      socket.emit('room:created', snapshot);
      io.to(code).emit('room:player_joined', { id: socket.id, name: playerName });

      console.log(`[ROOM ${code}] created by ${playerName}`);
    } catch (err) {
      const error = { ok: false, error: err.message || 'CREATE_ROOM_FAILED' };
      if (typeof ack === 'function') ack(error);
      socket.emit('room:error', error);
    }
  });

  // ---- Unirse a sala ----
  socket.on('join_room', (payload = {}, ack) => {
    try {
      const playerName = String(payload.playerName || '').trim();
      const code       = String(payload.roomCode   || '').trim().toUpperCase();
      if (!playerName) throw new Error('MISSING_PLAYER_NAME');
      if (!rooms.has(code)) throw new Error('ROOM_NOT_FOUND');

      const room = rooms.get(code);

      socket.join(code);
      socket.data.roomCode = code;
      socket.data.playerName = playerName;
      room.players.set(socket.id, { name: playerName });

      const snapshot = safeRoomSnapshot(code);

      // 1) ACK
      if (typeof ack === 'function') {
        ack({ ok: true, room: snapshot });
      }
      // 2) Fallback evento
      socket.emit('room:joined', snapshot);
      socket.to(code).emit('room:player_joined', { id: socket.id, name: playerName });

      console.log(`[ROOM ${code}] ${playerName} joined`);
    } catch (err) {
      const error = { ok: false, error: err.message || 'JOIN_ROOM_FAILED' };
      if (typeof ack === 'function') ack(error);
      socket.emit('room:error', error);
    }
  });

  // ---- Broadcast “passthrough” para tu lógica de juego ----
  // Cualquier evento 'game:*' lo reenvía a la sala del emisor.
  socket.onAny((event, data, cb) => {
    if (!event || typeof event !== 'string') return;
    if (!event.startsWith('game:')) return;
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) {
      const error = { ok: false, error: 'NOT_IN_ROOM' };
      if (typeof cb === 'function') cb(error);
      return;
    }
    // Envía a todos (incluido emisor) para mantener la lógica existente
    io.to(code).emit(event, { from: socket.id, ...data });
    if (typeof cb === 'function') cb({ ok: true });
  });

  // ---- Salida / limpieza ----
  function leaveCurrentRoom() {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    room.players.delete(socket.id);
    socket.leave(code);

    io.to(code).emit('room:player_left', { id: socket.id, name: socket.data.playerName });

    // Borra sala si se queda vacía
    if (room.players.size === 0) {
      rooms.delete(code);
      console.log(`[ROOM ${code}] removed (empty)`);
    }
    socket.data.roomCode = undefined;
  }

  socket.on('leave_room', (_payload, ack) => {
    leaveCurrentRoom();
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('disconnect', (reason) => {
    leaveCurrentRoom();
    console.log('Client disconnected', socket.id, reason);
  });
});

// Endpoint de depuración (opcional)
app.get('/rooms', (_req, res) => {
  res.json(Array.from(rooms.keys()));
});

server.listen(PORT, () => {
  console.log(`Survival Game server listening on http://0.0.0.0:${PORT}`);
  console.log(`Allowed origins: ${ORIGINS.join(', ')}`);
});
