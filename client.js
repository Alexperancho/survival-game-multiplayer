/* ========= helpers ========= */
const $ = (s) => document.querySelector(s);
const show = (id, yes=true) => document.getElementById(id).classList[yes?'remove':'add']('hidden');
const centerNotice = (msg, dur=900) => {
  const el = $('#centerNotice'); el.textContent = msg; show('centerNotice', true);
  setTimeout(()=>show('centerNotice', false), dur);
};
const toast = (msg) => {
  const t = $('#toast'); t.textContent = msg; show('toast', true);
  setTimeout(()=>show('toast', false), 1400);
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

/* ========= backend/socket ========= */
const BACKEND = (window.SG_BACKEND) || 'https://survival-game-multiplayer-production.up.railway.app';
console.log('[SG] Backend apuntando a →', BACKEND);

if (!window.io) {
  console.error('[SG] ERROR: socket.io CDN no está cargado');
}

const socket = io(BACKEND, {
  transports: ['websocket','polling'],
  withCredentials: false,
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 6000
});

socket.on('connect', () => {
  console.log('[SG] conectado ✓', { id: socket.id, url: BACKEND });
});
socket.on('connect_error', (err) => {
  console.warn('[SG] connect_error:', err?.message || err);
});

/* ========= estado mínimo ========= */
let ME = { id:null, name:null, host:false };
let ROOM = { code:'', name:'', seats:4, startLives:7 };
let CURRENT_TURN = null; // socketId o playerId
let ON_FIRE = new Set();  // ids con on fire para resaltar cartas

/* ========= UI: traducciones básicas ========= */
function applyI18n() {
  const t = I18N[LANG] || I18N.en;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k = el.dataset.i18n;
    const v = t[k];
    if (typeof v === 'string') el.textContent = v;
  });
  $('#turnBadge').textContent = t.your_turn;
}
$('#langSelect').value = LANG;
$('#langSelect').addEventListener('change', e=>{
  LANG = e.target.value; localStorage.setItem('sg_lang', LANG); applyI18n();
});
applyI18n();

/* ========= generación de código fiable ========= */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0,O,1,I
function generateRoomCode(len=6){
  let s=''; for(let i=0;i<len;i++){ s += CODE_CHARS[(Math.random()*CODE_CHARS.length)|0]; }
  return s;
}

/* ========= instructions ========= */
const INTRO_HTML_EN = `
  <h2>How to play</h2>
  <ol>
    <li>Create a room and share the code.</li>
    <li>Set players and starting lives.</li>
    <li>Each hand: play cards in turn; highest valid wins.</li>
    <li>End of round: lives are adjusted; first to reach 0 is out.</li>
  </ol>
`;
const INTRO_HTML_ES = `
  <h2>Cómo se juega</h2>
  <ol>
    <li>Crea una sala y comparte el código.</li>
    <li>Ajusta jugadores y vidas iniciales.</li>
    <li>En cada mano: jugad en turno; la carta válida más alta gana.</li>
    <li>Fin de ronda: se ajustan vidas; quien llega a 0, eliminado.</li>
  </ol>
`;
function openIntro(){
  $('#introBody').innerHTML = (LANG==='es') ? INTRO_HTML_ES : INTRO_HTML_EN;
  show('introModal', true);
}
$('#btnOpenIntro').onclick = openIntro;
$('#btnLobbyIntro').onclick = openIntro;
$('#closeIntro').onclick = ()=>show('introModal', false);

/* ========= navegación simple de vistas ========= */
function goto(viewId){
  ['view-join','view-lobby','view-preround','view-bids','view-play','view-summary'].forEach(id=>{
    show(id, id===viewId);
  });
}

/* ========= lobby: crear / unirse ========= */
$('#createRoomBtn').onclick = () => {
  const name = $('#playerName').value.trim() || 'Player';
  const roomName = $('#roomNameInput').value.trim();
  const code = generateRoomCode(6);
  const seats = parseInt($('#seatCount')?.value || '4',10);
  const startLives = parseInt($('#startingLives')?.value || '7',10);

  ME.name = name;
  socket.timeout(3500).emit('create_room', { code, roomName, seats, startLives, name }, (err, res)=>{
    if (err) {
      console.warn('[SG] create_room timeout/err => usando fallback events', err);
      // fallback: asumimos éxito si el server emite luego "room_created"
      return;
    }
    if (!res || res.ok!==true){
      return toast((res && res.error) ? res.error : 'Failed to create room');
    }
    afterRoomCreated(res.room || { code, roomName, seats, startLives });
  });
};

socket.on('room_created', (payload)=>{
  // para servidores que no usan ACK
  if (!payload) return;
  afterRoomCreated(payload);
});

function afterRoomCreated(room){
  ROOM.code = room.code || ROOM.code;
  ROOM.name = room.roomName || ROOM.name;
  ROOM.seats = room.seats || ROOM.seats;
  ROOM.startLives = room.startLives || ROOM.startLives;

  $('#roomCodeBadge').textContent = ROOM.code;
  centerNotice(`Room ${ROOM.code} ready`, 900);
  goto('view-lobby');
}

$('#joinRoomBtn').onclick = () => {
  const name = $('#playerName').value.trim() || 'Player';
  const code = $('#roomCode').value.trim().toUpperCase();
  if (!code || code.length < 4) return toast('Invalid code');
  ME.name = name;

  socket.timeout(3500).emit('join_room', { code, name }, (err, res)=>{
    if (err) { console.warn('[SG] join_room timeout/err', err); return; }
    if (!res || res.ok!==true) return toast(res?.error || 'Failed to join');
    ROOM.code = code;
    $('#roomCodeBadge').textContent = ROOM.code;
    goto('view-lobby');
  });
};

$('#btnConfigure').onclick = () => {
  const seats = parseInt($('#seatCount').value,10);
  const startLives = parseInt($('#startingLives').value,10);
  socket.emit('configure_room', { code: ROOM.code, seats, startLives });
  toast('Settings applied');
};
$('#btnStart').onclick = () => { socket.emit('start_now', { code: ROOM.code }); };

/* ========= turno muy visual ========= */
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

/* ========= hand log con mini-cartas ========= */
function rankSuitFromCode(code){
  // code: "AS","8D","TC"...
  const c = String(code||'').trim().toUpperCase();
  if (!c) return null;
  const r = c.slice(0, c.length-1);
  const s = c.slice(-1);
  return { r, s };
}
function suitSymbol(s){
  if (s==='H') return '♥';
  if (s==='D') return '♦';
  if (s==='S') return '♠';
  if (s==='C') return '♣';
  return '?';
}
function suitClass(s){
  return (s==='H'||s==='D') ? 's-red' : 's-black';
}
function cardMini(code){
  const rs = rankSuitFromCode(code);
  if (!rs) return '';
  return `<div class="card-mini"><div>${rs.r}</div><div class="s ${suitClass(rs.s)}">${suitSymbol(rs.s)}</div></div>`;
}
function renderMiniCardsList(list){
  // admite "AS,8D,3S" o ['AS','8D','3S']
  let arr = Array.isArray(list) ? list : String(list).split(/[,\s]+/).filter(Boolean);
  return arr.map(cardMini).join('');
}

/* ejemplo de cómo el server podría mandar las manos jugadas: 
   socket.on('hand_log', rows => renderHandLog(rows));
   Donde rows = [{winner:'Alice', cards:['AS','8D','3S','TC']}, ...]
*/
function renderHandLog(rows){
  const box = $('#handLog');
  if (!Array.isArray(rows)) return;
  box.innerHTML = rows.map(r => {
    const cards = renderMiniCardsList(r.cards||[]);
    const win = r.winner ? `<span class="pill">🏆 ${r.winner}</span>` : '';
    return `<div class="log-row">${win}${cards}</div>`;
  }).join('');
}

/* ========= ON FIRE (cliente) =========
   Si el server te manda un resumen de ronda con datos por jugador, intenta
   detectar: "damageDealt >= 5" y "noLosses === true".
   Si tu payload es distinto, adapta esta función al formato real.
*/
function maybeOnFireFromSummary(summary){
  // summary.players = [{id,name,damageDealt,losses,handCards:[...]}, ...]
  if (!summary || !Array.isArray(summary.players)) return;
  const t = I18N[LANG] || I18N.en;
  summary.players.forEach(p=>{
    if ((p.damageDealt|0) >= 5 && (p.losses|0) === 0){
      ON_FIRE.add(p.id||p.name);
      toast(t.on_fire);
      // resalta las cartas del jugador (si están visibles)
      if (p.id === ME.id || p.name === ME.name){
        $('#myHand')?.classList.add('fire-glow');
        setTimeout(()=>$('#myHand')?.classList.remove('fire-glow'), 6000);
      }
    }
  });
}

/* ========= ejemplo de eventos del server =========
   Ajusta los nombres si tu backend usa otros.
*/
socket.on('lobby_update', (payload)=>{
  // payload.players: [{id,name,host},...]
  const box = $('#playersLobby');
  if (!payload || !Array.isArray(payload.players)) return;
  box.innerHTML = payload.players.map(p=>`<span class="pill">${p.name}${p.host?' ⭐':''}</span>`).join(' ');
  // host es quien creó la sala (para mostrar controles)
  const amHost = !!payload.players.find(p=>p.id===socket.id && p.host);
  $('#hostControls').style.display = amHost ? '' : 'none';
});

socket.on('start_play', (payload)=>{
  goto('view-play');
  // set turno inicial si llega
  if (payload?.turnOwner){
    const amI = (payload.turnOwner.id===socket.id) || (payload.turnOwner.name===ME.name);
    setTurn(payload.turnOwner.name || 'Opponent', amI);
  }
  // pinta mano si llega
  if (Array.isArray(payload.myHand)){
    renderMyHand(payload.myHand);
  }
});

socket.on('turn_changed', (who)=>{
  const amI = (who?.id===socket.id) || (who?.name===ME.name);
  setTurn(who?.name||'Opponent', amI);
});

socket.on('hand_log', renderHandLog);

socket.on('round_summary', (sum)=>{
  goto('view-summary');
  // intenta detectar on-fire (si trae daño y pérdidas)
  maybeOnFireFromSummary(sum);
});

$('#btnNextRound').onclick = () => {
  socket.emit('next_round', { code: ROOM.code });
};

/* ========= pintar mano local ========= */
function renderMyHand(cards){
  const box = $('#myHand');
  if (!Array.isArray(cards)) return;
  // aplica on fire visual si estamos marcados
  if (ON_FIRE.has(ME.id) || ON_FIRE.has(ME.name)) {
    box.classList.add('fire-glow');
  } else {
    box.classList.remove('fire-glow');
  }
  box.innerHTML = cards.map(cardMini).join('');
}

/* ========= pequeños extras ========= */
window.addEventListener('keydown', (e)=>{
  if (e.key==='Escape'){ show('introModal', false); show('roundModal', false); }
});

/* ========= fin ========= */
