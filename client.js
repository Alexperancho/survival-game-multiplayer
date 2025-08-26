/* client.js — Survival Game (Cliente)
 * - Compatible con Socket.IO v4
 * - Sin eval / inline eval (CSP-friendly)
 * - Usa ACKs con timeout + fallback a eventos
 * - Se apoya en socket-override.js: window.io() ya apunta a Railway
 */

(function () {
  'use strict';

  /**************************************************************************
   * Utilidades DOM e interfaz
   **************************************************************************/
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function show(id, yes = true) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    el.classList[yes ? 'remove' : 'add']('hidden');
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    show(t, true);
    setTimeout(() => show(t, false), 2000);
  }

  function centerNotice(msg, dur = 800) {
    const el = document.getElementById('centerNotice');
    if (!el) return;
    el.innerHTML = `<div>${escapeHtml(msg)}</div>`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), dur);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function go(viewId) {
    // Oculta todas las secciones con clase "panel" y muestra la solicitada
    $$('.panel').forEach((p) => p.classList.add('hidden'));
    show(viewId, true);
    // El overview (footer) solo se muestra en juego / lobby / etc.
    const overviewVisible = viewId !== 'view-join';
    show('overview', overviewVisible);
  }

  /**************************************************************************
   * Estado del cliente
   **************************************************************************/
  let socket = null;

  let ROOM = ''; // Código de sala (p.ej. ZETA42)
  let ME = { id: null, name: null, token: null, host: false, roomName: '' };

  // Caches de UI (para evitar re-pintados completos si no hace falta)
  let PLAYERS_CACHE = []; // Para la lista de jugadores en el lobby

  // Token persistente del jugador (para reconexiones)
  const STORAGE_TOKEN_KEY = 'sg_token_v1';

  /**************************************************************************
   * i18n mínimo usado en esta pantalla (amplía si quieres)
   **************************************************************************/
  const I18N = {
    en: {
      welcome_title: 'Welcome',
      your_name: 'Your name',
      room_name_opt: 'Room name (optional)',
      room_code_join: 'Room code (to join)',
      create_room: 'Create room',
      join_room: 'Join room',
      intro_button: 'Instructions',
      join_hint: "Create a new room (we'll generate the code), or join an existing one with its code.",
      lobby: 'Lobby',
      copied: 'Copied!',
      connect_error: 'Connection error',
      created_ok: 'Room created!',
      joined_ok: 'Joined!',
      input_name: 'Please, type your name.',
      input_code: 'Room code is missing.',
    },
    es: {
      welcome_title: 'Bienvenido',
      your_name: 'Tu nombre',
      room_name_opt: 'Nombre de la sala (opcional)',
      room_code_join: 'Código de sala (para unirse)',
      create_room: 'Crear sala',
      join_room: 'Unirse a sala',
      intro_button: 'Instrucciones',
      join_hint: 'Crea una sala nueva (generamos el código), o únete con un código existente.',
      lobby: 'Lobby',
      copied: '¡Copiado!',
      connect_error: 'Error de conexión',
      created_ok: '¡Sala creada!',
      joined_ok: '¡Unido!',
      input_name: 'Escribe tu nombre.',
      input_code: 'Falta el código de sala.',
    }
  };

  function t(key) {
    const lang = ($('#langSelect')?.value || 'en').toLowerCase();
    const dict = I18N[lang] || I18N.en;
    return dict[key] || I18N.en[key] || key;
  }

  /**************************************************************************
   * Conexión Socket.IO
   * (window.io ya apunta a Railway gracias a socket-override.js)
   **************************************************************************/
  function initSocket() {
    // Reutiliza la conexión creada por socket-override si existe,
    // si no, crea una nueva (que igualmente está “envuelta” y va a Railway).
    socket = window.SG_socket || io();

    socket.on('connect', () => {
      console.log('[SG] connect', socket.id);
      // Envía token (si existe) para intentar re-enganchar sesión
      const token = localStorage.getItem(STORAGE_TOKEN_KEY);
      if (token) {
        socket.emit('reconnect_token', { token });
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('[SG] disconnect', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[SG] connect_error', err?.message || err);
      toast(t('connect_error'));
    });

    // Fallbacks por si el backend usa eventos en vez de ACKs
    socket.on('room:created', (payload) => {
      // payload: { code, me, players, roomName? }
      handleCreated(payload);
    });
    socket.on('room:joined', (payload) => {
      // payload: { code, me, players, roomName? }
      handleJoined(payload);
    });
    socket.on('room:error', (msg) => {
      if (msg) toast(msg);
    });

    // Estado/Lobby updates
    socket.on('lobby_state', (state) => {
      // state: { code, players:[{id,name,host}], hostId, roomName }
      renderLobby(state);
    });
    socket.on('room:state', (state) => {
      renderLobby(state);
    });
  }

  /**************************************************************************
   * Handlers de creación / unión
   **************************************************************************/
  function onClickCreate() {
    const name = ($('#playerName')?.value || '').trim();
    const roomName = ($('#roomNameInput')?.value || '').trim();
    const locale = ($('#langSelect')?.value || 'en').toLowerCase();

    if (!name) {
      toast(t('input_name'));
      $('#playerName')?.focus();
      return;
    }

    const token = localStorage.getItem(STORAGE_TOKEN_KEY) || null;
    const payload = { name, roomName, locale, token };

    // ACK con timeout; si el server no usa ACKs, caerá en fallback (eventos)
    socket.timeout(8000).emit('create_room', payload, (err, res) => {
      if (err) {
        console.warn('[SG] create_room timeout/err -> usando fallback eventos', err);
        return; // Esperamos 'room:created' del backend si lo emite
      }
      handleCreated(res);
    });
  }

  function onClickJoin() {
    const name = ($('#playerName')?.value || '').trim();
    const roomCode = ($('#roomCode')?.value || '').trim().toUpperCase();
    const locale = ($('#langSelect')?.value || 'en').toLowerCase();

    if (!name) {
      toast(t('input_name'));
      $('#playerName')?.focus();
      return;
    }
    if (!roomCode) {
      toast(t('input_code'));
      $('#roomCode')?.focus();
      return;
    }

    const token = localStorage.getItem(STORAGE_TOKEN_KEY) || null;
    const payload = { name, code: roomCode, locale, token };

    socket.timeout(8000).emit('join_room', payload, (err, res) => {
      if (err) {
        console.warn('[SG] join_room timeout/err -> usando fallback eventos', err);
        return; // Esperamos 'room:joined' del backend si lo emite
      }
      handleJoined(res);
    });
  }

  function handleCreated(res) {
    // Se admite forma con {ok:false,msg} o la esperada {code, me, players, roomName?}
    if (!res || (res.ok === false && res.msg)) {
      toast(res?.msg || 'Create error');
      return;
    }
    ROOM = res.code || res.roomCode || '';
    ME = normalizeMe(res.me, true /*host*/);
    if (ME.token) localStorage.setItem(STORAGE_TOKEN_KEY, ME.token);

    updateGlobalBadges(ROOM, res.roomName);
    go('view-lobby');
    toast(t('created_ok'));
    if (res.players) renderLobby({ code: ROOM, players: res.players, roomName: res.roomName, hostId: hostIdFromPlayers(res.players) });
  }

  function handleJoined(res) {
    if (!res || (res.ok === false && res.msg)) {
      toast(res?.msg || 'Join error');
      return;
    }
    ROOM = res.code || res.roomCode || '';
    ME = normalizeMe(res.me, !!res.me?.host);
    if (ME.token) localStorage.setItem(STORAGE_TOKEN_KEY, ME.token);

    updateGlobalBadges(ROOM, res.roomName);
    go('view-lobby');
    toast(t('joined_ok'));
    if (res.players) renderLobby({ code: ROOM, players: res.players, roomName: res.roomName, hostId: hostIdFromPlayers(res.players) });
  }

  function normalizeMe(me, hostFlag) {
    me = me || {};
    return {
      id: me.id || null,
      name: me.name || ($('#playerName')?.value || '').trim(),
      token: me.token || null,
      host: typeof me.host === 'boolean' ? me.host : !!hostFlag,
      roomName: me.roomName || ($('#roomNameInput')?.value || '').trim()
    };
  }

  function hostIdFromPlayers(players) {
    const h = (players || []).find(p => p.host);
    return h ? h.id : null;
  }

  /**************************************************************************
   * Render Lobby
   **************************************************************************/
  function renderLobby(state) {
    if (!state) return;

    ROOM = state.code || ROOM;
    updateGlobalBadges(ROOM, state.roomName);

    const players = Array.isArray(state.players) ? state.players : [];
    const hostId = state.hostId || hostIdFromPlayers(players) || ME.id;

    // Evita re-pintar si no cambian los IDs/nombres
    const changed = JSON.stringify(players.map(p => [p.id, p.name, !!p.host])) !==
                    JSON.stringify(PLAYERS_CACHE.map(p => [p.id, p.name, !!p.host]));
    if (!changed) return;
    PLAYERS_CACHE = players.slice();

    const cont = $('#playersLobby');
    if (!cont) return;
    cont.innerHTML = '';

    players.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'chip';
      el.textContent = p.name || '—';
      if (p.id === hostId) {
        el.classList.add('host');
        el.title = 'Host';
      }
      cont.appendChild(el);
    });

    // Controles de host visibles solo si yo soy host
    const isHost = (ME && ME.id && ME.id === hostId) || !!ME.host;
    show('hostControls', isHost);

    // Consejito de rellenar la sala
    const fillHint = $('#fillHint');
    if (fillHint) {
      const count = players.length;
      fillHint.textContent = isHost
        ? (count < 2 ? 'Share the code to invite more players.' : 'All set! You can configure and start.')
        : '';
    }
  }

  function updateGlobalBadges(roomCode, roomName) {
    const badge = $('#roomCodeBadge');
    const badgeGlobal = $('#roomCodeGlobal');
    const roomNameSpan = $('#roomName');

    if (badge) badge.textContent = roomCode || '—';
    if (badgeGlobal) badgeGlobal.textContent = roomCode || '—';
    if (roomNameSpan) roomNameSpan.textContent = roomName || ($('#roomNameInput')?.value || '').trim() || '';
  }

  /**************************************************************************
   * Controles de UI
   **************************************************************************/
  function bindUI() {
    const btnCreate = $('#btnCreate');
    const btnJoin = $('#btnJoin');
    const btnCopy = $('#copyCode');

    if (btnCreate) btnCreate.addEventListener('click', onClickCreate);
    if (btnJoin) btnJoin.addEventListener('click', onClickJoin);

    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        try {
          const code = ROOM || $('#roomCodeBadge')?.textContent || '';
          await navigator.clipboard.writeText(code);
          centerNotice(t('copied'), 800);
        } catch {
          // fallback silencioso
        }
      });
    }

    // Idioma: refresca textos simples (esta demo solo usa unos pocos)
    const langSel = $('#langSelect');
    if (langSel) {
      langSel.addEventListener('change', () => {
        // Si quieres, aquí reinyectas textos data-i18n… (omito por brevedad)
      });
    }
  }

  /**************************************************************************
   * Inicio
   **************************************************************************/
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[SG] Backend apuntando a:', window.SG_BACKEND);
    bindUI();
    initSocket();
    go('view-join'); // Vista inicial
  });

})();
