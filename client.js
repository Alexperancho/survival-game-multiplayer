/* ========= helpers ========= */
const $ = (s) => document.querySelector(s);
const show = (id, yes=true) => document.getElementById(id).classList[yes?'remove':'add']('hidden');
const centerNotice = (msg, dur=900) => {
  const el = $('#centerNotice'); el.textContent = msg; show('centerNotice', true);
  setTimeout(()=>show('centerNotice', false), dur);
};
const toast = (msg) => {
  const t = $('#toast'); t.textContent = msg; show('toast', true);
  setTimeout(()=>show('toast', false), 1600);
};

/* ========= i18n mínimo ========= */
const I18N = {
  en: {
    welcome_title: "Welcome",
    your_name: "Your name",
    room_name_opt: "Room name (optional)",
    room_code_join: "Room code (to join)",
    create_room: "Create room",
    join_room: "Join room",
    intro_button: "Instructions",
    join_hint: "Create a new room (we'll generate the code), or join an existing one with its code.",
    lobby: "Lobby",
    num_players: "Number of players (2–10)",
    starting_lives: "Starting lives",
    apply_settings: "Apply settings",
    start_now: "Start now (manual)",
    share_hint: "Share this page + room code with your friends.",
    play: "Play",
    your_hand: "Your hand",
    summary: "Summary",
    player: "Player", wins: "Wins", ask_delta: "Ask Δ", lives: "Lives", bid: "Bid",
    hand_log: "Hand log",
    round_summary: "Round summary",
    next_round: "Next round",
    your_turn: "Your turn",
    waiting_for: name => `Waiting for ${name}…`,
    on_fire: "You're on fire!"
  },
  es: {
    welcome_title: "Bienvenido",
    your_name: "Tu nombre",
    room_name_opt: "Nombre de la sala (opcional)",
    room_code_join: "Código de sala (para unirse)",
    create_room: "Crear sala",
    join_room: "Unirse a sala",
    intro_button: "Instrucciones",
    join_hint: "Crea una sala nueva (generamos el código), o únete con un código existente.",
    lobby: "Lobby",
    num_players: "Número de jugadores (2–10)",
    starting_lives: "Vidas iniciales",
    apply_settings: "Aplicar ajustes",
    start_now: "Empezar ahora (manual)",
    share_hint: "Comparte esta página + el código con tus amigos.",
    play: "Jugar",
    your_hand: "Tu mano",
    summary: "Resumen",
    player: "Jugador", wins: "Victorias", ask_delta: "Ask Δ", lives: "Vidas", bid: "Puja",
    hand_log: "Registro de manos",
    round_summary: "Resumen de ronda",
    next_round: "Siguiente ronda",
    your_turn: "¡Tu turno!",
    waiting_for: name => `Esperando a ${name}…`,
    on_fire: "¡Estás on fire!"
  }
};
let LANG = (localStorage.getItem('sg_lang')||'en'); // en|es
function applyI18n(){
  const t = I18N[LANG] || I18N.en;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k = el.dataset.i18n;
    const v = t[k];
    if (typeof v === 'string') el.textContent = v;
  });
  $('#turnBadge').textContent = (I18N[LANG]||I18N.en).your_turn;
}
$('#langSelect').value = LANG;
$('#langSelect').addEventListener('change', e=>{
  LANG = e.target.value; localStorage.setItem('sg_lang', LANG); applyI18n();
});
applyI18n();

/* ========= backend/socket ========= */
const BACKEND = (window.SG_BACKEND) || 'https://survival-game-multiplayer-production.up.railway.app';
console.log('[SG] Backend apuntando a →', BACKEND);

if (!window.io) console.error('[SG] ERROR: socket.io CDN no está cargado');

const socket = io(BACKEND, {
  transports: ['websocket','polling'],
  withCredentials: false,
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 6000
});
socket.on('connect', ()=> console.log('[SG] conectado ✓', { id: socket.id, url: BACKEND }));
socket.on('connect_error', (err)=> console.warn('[SG] connect_error:', err?.message || err));

/* ========= estado ========= */
let ME = { id:null, name:null, host:false };
let ROOM = { code:'', name:'', seats:4, startLives:7 };
let CURRENT_TURN = null;
let ON_FIRE = new Set();

/* ========= util ========= */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0,O,1,I
function generateRoomCode(len=6){
  let s=''; for(let i=0;i<len;i++){ s += CODE_CHARS[(Math.random()*CODE_CHARS.length)|0]; }
  return s;
}
function setUrlHash(code){ try{ location.hash = '#' + (code||''); }catch(_){} }

/* ========= instrucciones ========= */
const INTRO_HTML_EN = `
  <h2>How to play</h2>
  <ol>
    <li>Create a room and share the code.</li>
    <li>Set players and starting lives.</li>
    <li>Each hand: play cards in turn; highest valid wins.</li>
    <li>End of round: lives are adjusted; first to reach 0 is out.</li>
  </ol>`;
const INTRO_HTML_ES = `
  <h2>Cómo se juega</h2>
  <ol>
    <li>Crea una sala y comparte el código.</li>
    <li>Ajusta jugadores y vidas iniciales.</li>
    <li>En cada mano: jugad en turno; la carta válida más alta gana.</li>
    <li>Fin de ronda: se ajustan vidas; quien llega a 0, eliminado.</li>
  </ol>`;
function openIntro(){
  $('#introBody').innerHTML = (LANG==='es') ? INTRO_HTML_ES : INTRO_HTML_EN;
  show('introModal', true);
}
$('#btnOpenIntro').onclick = openIntro;
$('#btnLobbyIntro').onclick = openIntro;
$('#closeIntro').onclick = ()=>show('introModal', false);

/* ========= vistas ========= */
function goto(viewId){
  ['view-join','view-lobby','view-preround','view-bids','view-play','view-summary'].forEach(id=>{
    show(id, id===viewId);
  });
}

/* ========= LOBBY helpers ========= */
function afterRoomCreated(room, opts={}){
  ROOM.code = room.code || ROOM.code;
  ROOM.name = room.roomName || ROOM.name;
  ROOM.seats = room.seats || ROOM.seats;
  ROOM.startLives = room.startLives || ROOM.startLives;

  $('#roomCodeBadge').textContent = ROOM.code || '';
  setUrlHash(ROOM.code);
  goto('view-lobby');

  if (opts.optimistic) {
    centerNotice((LANG==='es'?'Creando sala…':'Creating room…'), 900);
  } else {
    centerNotice((LANG==='es'?'Sala creada':'Room ready'), 900);
  }
}

/* ========= crear / unirse ========= */
$('#createRoomBtn').onclick = () => {
  const name = $('#playerName').value.trim() || 'Player';
  const roomName = $('#roomNameInput').value.trim();
  const code = generateRoomCode(6);
  const seats = parseInt($('#seatCount')?.value || '4',10);
  const startLives = parseInt($('#startingLives')?.value || '7',10);

  ME.name = name;
  ME.host = true;

  // Paso 1: navegación OPTIMISTA al lobby (para que no te quedes colgado)
  afterRoomCreated({ code, roomName, seats, startLives }, { optimistic:true });

  // Paso 2: pedir al servidor crear la sala. Si falla, revertimos.
  socket.timeout(3500).emit('create_room', { code, roomName, seats, startLives, name }, (err, res)=>{
    if (err) {
      console.warn('[SG] create_room timeout/err (seguimos en lobby esperando evento server).', err);
      return; // esperamos eventos como 'room_created'
    }
    if (!res || res.ok!==true){
      toast(res?.error || (LANG==='es'?'No se pudo crear la sala':'Failed to create room'));
      // revertimos a la vista de join
      goto('view-join'); setUrlHash('');
      return;
    }
    // confirmado (por callback)
    afterRoomCreated(res.room || { code, roomName, seats, startLives });
  });
};

// Aceptamos varios posibles nombres de evento de servidor
['room_created','roomCreated','created_room'].forEach(evt=>{
  socket.on(evt, (payload)=>{
    if (!payload) return;
    afterRoomCreated(payload);
  });
});

$('#joinRoomBtn').onclick = () => {
  const name = $('#playerName').value.trim() || 'Player';
  const code = $('#roomCode').value.trim().toUpperCase();
  if (!code || code.length < 4) return toast(LANG==='es'?'Código inválido':'Invalid code');
  ME.name = name; ME.host = false;

  // Navegación optimista al lobby (mostramos el código mientas entra)
  afterRoomCreated({ code }, { optimistic:true });

  socket.timeout(3500).emit('join_room', { code, name }, (err, res)=>{
    if (err) { console.warn('[SG] join_room timeout/err', err); return; }
    if (!res || res.ok!==true) {
      toast(res?.error || (LANG==='es'?'No se pudo entrar':'Failed to join'));
      goto('view-join'); setUrlHash(''); return;
    }
    // confirmado
    afterRoomCreated({ code });
  });
};

$('#btnConfigure').onclick = () => {
  if (!ME.host) return toast(LANG==='es'?'Solo el anfitrión':'Host only');
  const seats = parseInt($('#seatCount').value,10);
  const startLives = parseInt($('#startingLives').value,10);
  socket.emit('configure_room', { code: ROOM.code, seats, startLives });
  toast(LANG==='es'?'Ajustes aplicados':'Settings applied');
};
$('#btnStart').onclick = () => {
  if (!ME.host) return toast(LANG==='es'?'Solo el anfitrión':'Host only');
  socket.emit('start_now', { code: ROOM.code });
};

/* ========= lobby updates ========= */
socket.on('lobby_update', (payload)=>{
  const box = $('#playersLobby');
  if (!payload || !Array.isArray(payload.players)) return;
  box.innerHTML = payload.players.map(p=>`<span class="pill">${p.name}${p.host?' ⭐':''}</span>`).join(' ');
  const amHost = !!payload.players.find(p=>p.id===socket.id && p.host);
  $('#hostControls').style.display = amHost ? '' : 'none';
});

/* ========= turnos muy visibles ========= */
function setTurn(turnOwnerNameOrId, amI=false){
  const badge = $('#turnBadge');
  const hint = $('#playHint');
  const t = I18N[LANG] || I18N.en;

  if (amI){
    badge.classList.remove('hidden');
    hint.textContent = t.your_turn;
  } else {
    badge.classList.add('hidden');
    const pretty = typeof turnOwnerNameOrId==='string' ? turnOwnerNameOrId : 'Opponent';
    hint.textContent = (t.waiting_for(pretty));
  }
}

/* ========= mini-cartas p/ hand log ========= */
function rankSuitFromCode(code){
  const c = String(code||'').trim().toUpperCase(); if (!c) return null;
  const r = c.slice(0, c.length-1), s = c.slice(-1); return { r, s };
}
function suitSymbol(s){ return s==='H'?'♥':s==='D'?'♦':s==='S'?'♠':s==='C'?'♣':'?'; }
function suitClass(s){ return (s==='H'||s==='D') ? 's-red' : 's-black'; }
function cardMini(code){
  const rs = rankSuitFromCode(code); if (!rs) return '';
  return `<div class="card-mini"><div>${rs.r}</div><div class="s ${suitClass(rs.s)}">${suitSymbol(rs.s)}</div></div>`;
}
function renderMiniCardsList(list){
  let arr = Array.isArray(list) ? list : String(list).split(/[,\s]+/).filter(Boolean);
  return arr.map(cardMini).join('');
}
function renderHandLog(rows){
  const box = $('#handLog');
  if (!Array.isArray(rows)) return;
  box.innerHTML = rows.map(r => {
    const cards = renderMiniCardsList(r.cards||[]);
    const win = r.winner ? `<span class="pill">🏆 ${r.winner}</span>` : '';
    return `<div class="log-row">${win}${cards}</div>`;
  }).join('');
}

/* ========= ON FIRE (cliente, usa resumen de ronda) ========= */
function maybeOnFireFromSummary(summary){
  if (!summary || !Array.isArray(summary.players)) return;
  const t = I18N[LANG] || I18N.en;
  summary.players.forEach(p=>{
    if ((p.damageDealt|0) >= 5 && (p.losses|0) === 0){
      ON_FIRE.add(p.id||p.name);
      toast(t.on_fire);
      if (p.id === ME.id || p.name === ME.name){
        $('#myHand')?.classList.add('fire-glow');
        setTimeout(()=>$('#myHand')?.classList.remove('fire-glow'), 6000);
      }
    }
  });
}

/* ========= juego ========= */
socket.on('start_play', (payload)=>{
  goto('view-play');
  if (payload?.turnOwner){
    const amI = (payload.turnOwner.id===socket.id) || (payload.turnOwner.name===ME.name);
    setTurn(payload.turnOwner.name || 'Opponent', amI);
  }
  if (Array.isArray(payload?.myHand)) renderMyHand(payload.myHand);
});
socket.on('turn_changed', (who)=>{
  const amI = (who?.id===socket.id) || (who?.name===ME.name);
  setTurn(who?.name||'Opponent', amI);
});
socket.on('hand_log', renderHandLog);
socket.on('round_summary', (sum)=>{ goto('view-summary'); maybeOnFireFromSummary(sum); });
$('#btnNextRound').onclick = () => socket.emit('next_round', { code: ROOM.code });

function renderMyHand(cards){
  const box = $('#myHand');
  if (!Array.isArray(cards)) return;
  if (ON_FIRE.has(ME.id) || ON_FIRE.has(ME.name)) box.classList.add('fire-glow');
  else box.classList.remove('fire-glow');
  box.innerHTML = cards.map(cardMini).join('');
}

/* ========= UX ========= */
window.addEventListener('keydown', (e)=>{
  if (e.key==='Escape'){ show('introModal', false); show('roundModal', false); }
});

/* ========= fin ========= */
