const $ = sel => document.querySelector(sel);
const show = (id, yes=true)=> document.getElementById(id).classList[yes?'remove':'add']('hidden');
const toast = (msg)=>{ const t=document.getElementById('toast'); t.textContent=msg; show('toast',true); setTimeout(()=>show('toast',false), 1800); };

let socket; let ROOM=''; let ME={ id:null, name:null, token:null, host:false };
let MY_HAND=[];
let CURRENT_ROUND = null;
let ORDER_CACHE = []; // for Round 1 labels
let PLAYERS_CACHE = []; // for overview chips

// i18n
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
    player: "Player",
    wins: "Wins",
    ask_delta: "Ask \u0394",
    lives: "Lives",
    bid: "Bid",
    hand_log: "Hand log",
    round_summary: "Round summary",
    next_round: "Next round",
    instructions: "Instructions",
    opponents_cards: "Opponents' cards",
    your_opponent_card: "Your opponent's card",
    current_total: "Current total",
    confirm_bid: "Confirm bid",
    pick_card: "Pick a card to play",
    waiting: "Waiting for other players",
    first_speaker: "First speaker",
    round: "Round",
    current: "Current",
    total_so_far: "Total so far",
    yes: "Yes",
    no: "No",
    copy: "Copy",
    copied: "Copied!",
    help_title: (r)=> `Round ${r}`,
    help_common: `Highest card wins the hand. Suits don't matter. Aces are the lowest. In a tie of the highest rank, the first card played wins.`,
    help_round2: `Speak your Win Asks **before** you see your two cards.`,
    help_round1: `You see everyone else's single card, but not your own. Answer Yes/No to "Do you think you will win?"`,
  },
  es: {
    welcome_title: "Bienvenido",
    your_name: "Tu nombre",
    room_name_opt: "Nombre de la sala (opcional)",
    room_code_join: "Código de sala (para unirse)",
    create_room: "Crear sala",
    join_room: "Unirse a sala",
    intro_button: "Instrucciones",
    join_hint: "Crea una sala nueva (generamos el código) o únete con un código existente.",
    lobby: "Sala de espera",
    num_players: "Número de jugadores (2–10)",
    starting_lives: "Vidas iniciales",
    apply_settings: "Aplicar ajustes",
    start_now: "Empezar ahora (manual)",
    share_hint: "Comparte esta página + el código con tus amigos.",
    play: "Jugar",
    your_hand: "Tu mano",
    summary: "Resumen",
    player: "Jugador",
    wins: "Manos Ganadas",
    ask_delta: "Apuesta \u0394",
    lives: "Vidas",
    bid: "Apuesta",
    hand_log: "Registro de manos",
    round_summary: "Resumen de la ronda",
    next_round: "Siguiente ronda",
    instructions: "Instrucciones",
    opponents_cards: "Cartas de los oponentes",
    your_opponent_card: "La carta de tu oponente",
    current_total: "Total actual",
    confirm_bid: "Confirmar apuesta",
    pick_card: "Elige una carta para jugar",
    waiting: "Esperando a los demás",
    first_speaker: "Primer hablante",
    round: "Ronda",
    current: "Turno",
    total_so_far: "Suma parcial",
    yes: "Sí",
    no: "No",
    copy: "Copiar",
    copied: "¡Copiado!",
    help_title: (r)=> `Ronda ${r}`,
    help_common: `La carta más alta gana la baza. Los palos no importan. Los ases son los más bajos. En empate del valor más alto, gana quien la jugó primero.`,
    help_round2: `En la Ronda 2 se declara la apuesta de manos **antes** de ver tus dos cartas.`,
    help_round1: `Ves la carta de los demás pero no la tuya. Responde Sí/No a “¿Crees que vas a ganar?”.`,
  }
};

let LANG = (localStorage.getItem('sg_lang') || (navigator.language||'en').slice(0,2)).toLowerCase().startsWith('es') ? 'es' : 'en';
const langSelectEl = $('#langSelect');
if(langSelectEl) langSelectEl.value = LANG;

// Easy t()
function t(key){
  const bundle = I18N[LANG] || I18N.en;
  return bundle[key] ?? key;
}

function applyI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if(typeof val === 'string') el.textContent = val;
  });
  // Update placeholders
  const rc=$('#roomCode'); if(rc) rc.placeholder = (LANG==='es'?'p.ej. ZETA42':'e.g. ZETA42');
  const rn=$('#roomNameInput'); if(rn) rn.placeholder = (LANG==='es'?'Viernes por la noche':'Friday Night');
  const pn=$('#playerName'); if(pn) pn.placeholder = (LANG==='es'?'Alicia':'Alice');
}
applyI18n();

if(langSelectEl){
  langSelectEl.addEventListener('change', ()=>{
    LANG = langSelectEl.value;
    localStorage.setItem('sg_lang', LANG);
    applyI18n();
  });
}

// Intro / Instructions content
function introHTML(){
  if(LANG==='es'){
    return `
    <h2>Resumen general</h2>
    <p>Survival Game se juega con una baraja de 52 cartas. De 2 a 10 jugadores. Cada uno empieza con un número de vidas. El objetivo es conservarlas: el último jugador con vidas gana.</p>
    <ul>
      <li>Orden de valores: A (más bajo), 2, 3, …, 10, J, Q, K (más alto). Los palos no importan.</li>
      <li>Las rondas van de 5 a 1 cartas por jugador. Al terminar la Ronda 1, vuelve a la Ronda 5.</li>
      <li>En las rondas 5–2 cada jugador dice cuántas manos cree que ganará (“Apuesta”).</li>
      <li>Penalización: vidas perdidas = |Apuesta − Manos ganadas|.</li>
    </ul>
    <h3>Ronda 5, 4 y 3</h3>
    <p>Se repite el patrón: se reparten cartas (5/4/3). Se determina al primer hablante. Cada baza:</p>
    <ol>
      <li>Juega una carta el que empieza, luego en sentido horario.</li>
      <li>Gana la carta de mayor valor; en empate gana la que se jugó antes.</li>
    </ol>
    <p><em>Ejemplo:</em> Si se juegan K, 10, Q, gana K. Si hay dos Q como valor más alto, gana la que se puso primero.</p>
    <h3>Ronda 2 (apuesta a ciegas)</h3>
    <p>Todos declaran su apuesta <strong>antes</strong> de ver sus 2 cartas. Después se revelan sus propias cartas y se juega igual.</p>
    <h3>Ronda 1 (Sí/No)</h3>
    <p>Cada jugador ve las cartas de los demás, pero no la propia. Responde “Sí” si crees que tu carta ganará, “No” si no. Tras responder todos, se revelan todas y se aplica:</p>
    <ul><li>Si aciertas, no pierdes vidas.</li><li>Si fallas, pierdes 1 vida.</li></ul>
    <h3>Cierre</h3>
    <p>El ganador de una baza comienza la siguiente. Tras cada ronda se ajustan vidas y se elimina a quien llegue a 0. ¡Suerte!</p>
    `;
  }
  return `
    <h2>Overall summary</h2>
    <p>Survival Game uses a standard 52-card deck. 2–10 players. Everyone starts with some lives. Goal: keep your lives — last player standing wins.</p>
    <ul>
      <li>Rank order: A (lowest), 2, 3, …, 10, J, Q, K (highest). Suits don’t matter.</li>
      <li>Rounds go 5 down to 1 cards per player. After Round 1, loop back to Round 5.</li>
      <li>In Rounds 5–2 each player bids how many hands they expect to win (“Win Asks”).</li>
      <li>Penalty: lives lost = |Bid − Hands won|.</li>
    </ul>
    <h3>Rounds 5, 4, and 3</h3>
    <p>Same pattern: deal cards (5/4/3). Pick first speaker. For each trick:</p>
    <ol>
      <li>Starter plays a card, then clockwise.</li>
      <li>Highest rank wins; if tied at highest, the earliest played wins.</li>
    </ol>
    <p><em>Example:</em> If K, 10, Q are played, K wins. If two Q’s are the top rank, the first Q wins.</p>
    <h3>Round 2 (blind bidding)</h3>
    <p>Everyone bids <strong>before</strong> seeing their 2 cards. Then their own cards are revealed and play proceeds.</p>
    <h3>Round 1 (Yes/No)</h3>
    <p>You see everyone else’s single card but not your own. Say “Yes” if you think you will win, “No” otherwise. After all answer, reveal all cards and apply:</p>
    <ul><li>If correct, lose 0 lives.</li><li>If wrong, lose 1 life.</li></ul>
    <h3>Closing</h3>
    <p>Trick winner starts the next trick. After each round, lives are adjusted and anyone at 0 is eliminated. Good luck!</p>
  `;
}

function roundHelpHTML(round){
  const hc = (LANG==='es') ? I18N.es.help_common : I18N.en.help_common;
  if(LANG==='es'){
    if(round===2) return `<h2>${I18N.es.help_title(round)}</h2><p>${hc}</p><p>${I18N.es.help_round2}</p>`;
    if(round===1) return `<h2>${I18N.es.help_title(round)}</h2><p>${hc}</p><p>${I18N.es.help_round1}</p>`;
    return `<h2>${I18N.es.help_title(round)}</h2><p>${hc}</p>`;
  } else {
    if(round===2) return `<h2>${I18N.en.help_title(round)}</h2><p>${hc}</p><p>${I18N.en.help_round2}</p>`;
    if(round===1) return `<h2>${I18N.en.help_title(round)}</h2><p>${hc}</p><p>${I18N.en.help_round1}</p>`;
    return `<h2>${I18N.en.help_title(round)}</h2><p>${hc}</p>`;
  }
}

// Card rendering (display '10' for T)
const SUITS = { S:'\u2660', H:'\u2665', D:'\u2666', C:'\u2663' };
function displayRank(r){ return r==='T' ? '10' : r; }
function cardNode(code, click){
  const n=document.createElement('div');
  n.className='card ' + ((code[1]==='H'||code[1]==='D')?'red':'');
  n.innerHTML = `<div class="rank">${displayRank(code[0])}</div><div class="suit">${SUITS[code[1]]}</div>`;
  if(click) n.addEventListener('click', click);
  return n;
}

// Connect
function connect(){ if(!socket){ socket = io(); bindSocket(); } }

// Create room
$('#btnCreate').onclick = ()=>{
  const name = ($('#playerName').value||'Player').trim();
  const roomName = ($('#roomNameInput').value||'').trim();
  if(!name){ toast(LANG==='es'?'Escribe tu nombre':'Enter your name'); return; }
  connect();
  socket.emit('create_room', { name, roomName });
};

// Join room
$('#btnJoin').onclick = ()=>{
  ROOM = ($('#roomCode').value||'').trim().toUpperCase();
  const name = ($('#playerName').value||'Player').trim();
  if(!ROOM){ toast(LANG==='es'?'Escribe el código de sala':'Enter room code'); return; }
  connect();
  const token = localStorage.getItem('sg_token_'+ROOM) || null;
  socket.emit('join_room', { roomCode: ROOM, name, token });
};

// Intro modal
function openIntro(){ $('#introBody').innerHTML = introHTML(); show('introModal', true); }
function closeIntro(){ show('introModal', false); }
const btnOpenIntro = $('#btnOpenIntro');
if(btnOpenIntro) btnOpenIntro.onclick = openIntro;
const btnLobbyIntro = $('#btnLobbyIntro');
if(btnLobbyIntro) btnLobbyIntro.onclick = openIntro;
$('#closeIntro').onclick = closeIntro;
// Close by clicking backdrop
document.getElementById('introModal').addEventListener('click', (e)=>{
  if(e.target.classList.contains('modal')) closeIntro();
});

// Round help modal (bottom bar "?")
function openRoundHelp(){ const r = CURRENT_ROUND || 5; $('#roundBody').innerHTML = roundHelpHTML(r); show('roundModal', true); }
function closeRoundHelp(){ show('roundModal', false); }
$('#btnRoundHelp').onclick = openRoundHelp;
$('#closeRound').onclick = closeRoundHelp;
document.getElementById('roundModal').addEventListener('click', (e)=>{
  if(e.target.classList.contains('modal')) closeRoundHelp();
});

// Copy room code
$('#copyCode').onclick = ()=>{
  const code = $('#roomCodeGlobal').textContent.trim();
  if(!code || code==='—') return;
  navigator.clipboard.writeText(code).then(()=> toast((LANG==='es')?'¡Copiado!':'Copied!') );
};

function renderOverview({ round, trickN, starter, turn, players, roomName, code }){
  // This bar lives at the bottom and is hidden on welcome/lobby
  $('#roomName').textContent = roomName ? roomName : '';
  $('#roomCodeGlobal').textContent = code || '—';
  $('#ovRound').textContent = `${(LANG==='es'?'Ronda':'Round')} ${round ?? '—'}`;
  const totalHands = round || '—';
  $('#ovHand').textContent = `Hand ${trickN ?? 1}/${totalHands}`;
  const starterName = players?.find(p=>p.id===starter)?.name ?? '—';
  const turnName = players?.find(p=>p.id===turn)?.name ?? '—';
  $('#ovStarter').textContent = `Starter ${starterName}`;
  $('#ovTurn').textContent = `Turn ${turnName}`;
  // Player chips
  const bar = document.getElementById('overview');
  bar.querySelectorAll('.chips').forEach(x=>x.remove());
  if(players){
    const chips = document.createElement('div');
    chips.className='chips';
    players.forEach(p=>{
      const chip=document.createElement('div');
      chip.className='pill';
      chip.textContent = `${p.name} · ${(LANG==='es'?'Vidas':'Lives')}: ${p.lives} · ${(LANG==='es'?'Manos':'Wins')}: ${p.wins||0} · ${(LANG==='es'?'Apuesta':'Bid')}: ${p.bid==null?'—':p.bid}`;
      chips.appendChild(chip);
    });
    bar.appendChild(chips);
  }
}

// Socket bindings
function bindSocket(){
  socket.on('room_created', ({ code, host, token, startingLives, roomName })=>{
    ROOM = code; ME.id = socket.id; ME.name = ($('#playerName').value||'Player').trim(); ME.host = host; ME.token = token;
    localStorage.setItem('sg_token_'+ROOM, token);
    $('#roomCodeBadge').textContent = code;
    $('#roomCodeGlobal').textContent = code;
    $('#roomName').textContent = roomName || '';
    show('view-join', false); show('view-lobby', true);
    show('overview', false); // hide footer in lobby
    show('hostControls', true);
    $('#startingLives').value = startingLives;
  });

  socket.on('joined', ({ code, host, token, startingLives, roomName })=>{
    ROOM = code; ME.id = socket.id; ME.name = ($('#playerName').value||'Player').trim(); ME.host = host; ME.token = token;
    localStorage.setItem('sg_token_'+ROOM, token);
    $('#roomCodeBadge').textContent = code;
    $('#roomCodeGlobal').textContent = code;
    $('#roomName').textContent = roomName || '';
    show('view-join', false); show('view-lobby', true);
    show('overview', false); // hide footer in lobby
  });

  socket.on('room_state', ({ roomName, players, hostId, status, round, startingLives, targetSeats })=>{
    PLAYERS_CACHE = players || [];
    const box = document.getElementById('playersLobby'); box.innerHTML='';
    players.forEach(p=>{
      const div=document.createElement('div'); div.className='pill';
      if(p.isHost) div.innerHTML = `\u2605 ${p.name}`; else div.textContent = p.name;
      box.appendChild(div);
    });
    if(ME.id===hostId){ show('hostControls', true); }
    // Update fill hint
    if(typeof targetSeats==='number' && targetSeats>0){
      document.getElementById('fillHint').textContent = `${LANG==='es'?'Jugadores':'Players'}: ${players.length} / ${targetSeats}`;
    } else {
      document.getElementById('fillHint').textContent = LANG==='es'?'Indica jugadores y vidas y comparte el código.':'Set number of players and lives, then share the code.';
    }
    // Keep footer hidden in lobby
    show('overview', false);
  });

  // Host config
  document.getElementById('btnConfigure').onclick = ()=>{
    const seats = +document.getElementById('seatCount').value|0;
    const lives = +document.getElementById('startingLives').value|0;
    socket.emit('configure_room', { roomCode: ROOM, seats, lives });
  };
  document.getElementById('btnStart').onclick = ()=> socket.emit('start_game', { roomCode: ROOM });

  socket.on('preround_state', ({ roomName, round, firstSpeaker, order, players })=>{
    CURRENT_ROUND = round;
    ORDER_CACHE = order || [];
    PLAYERS_CACHE = players || [];
    show('view-lobby', false); show('view-summary', false); show('view-preround', true);
    show('overview', true); // show footer from gameplay onwards
    document.getElementById('hdrRound').textContent = `${(LANG==='es'?'Ronda':'Round')} ${round}`;
    const badges = document.getElementById('orderBadges'); badges.innerHTML='';
    order.forEach((o,i)=>{ const d=document.createElement('div'); d.className='pill'; d.textContent=(i===0?'▶ ':'')+o.name; badges.appendChild(d); });
    const fs = order.find(o=>o.id===firstSpeaker); document.getElementById('firstSpeakerNote').textContent = `${(LANG==='es'?'Primer hablante':'First speaker')}: ${fs? fs.name : '—'}`;
    renderOverview({ round, trickN: 1, starter: firstSpeaker, turn: firstSpeaker, players, roomName, code: $('#roomCodeGlobal').textContent });
  });

  // Private hand after dealing
  socket.on('private_hand', ({ hand })=>{ MY_HAND = hand; });

  socket.on('bids_state', ({ roomName, round, current, sum, lastSpeaker, bids, players })=>{
    CURRENT_ROUND = round;
    PLAYERS_CACHE = players || [];
    show('view-preround', false); show('view-play', false); show('view-bids', true);
    show('overview', true);
    document.getElementById('hdrBids').textContent = `${(LANG==='es'?'Ronda':'Round')} ${round} — ${(LANG==='es'?'Apuesta':'Bid')}`;
    const area = document.getElementById('bidsArea'); area.innerHTML='';
    const meTurn = (current===socket.id);
    const p = document.createElement('div');
    p.innerHTML = `<div class="pill">${(LANG==='es'?'Turno':'Current')}: ${meTurn? (LANG==='es'?'Tú':'You') : (LANG==='es'?'Oponente':'Opponent')}</div><div class="pill">${(LANG==='es'?'Suma parcial':'Total so far')}: ${sum}</div>`;
    area.appendChild(p);

    // Show list of bids so far
    const list=document.createElement('ul'); list.className='bidslist';
    (bids||[]).forEach(b=>{
      const li=document.createElement('li');
      li.textContent = `${b.name}: ${b.bid==null?'—':b.bid}`;
      list.appendChild(li);
    });
    area.appendChild(list);

    renderOverview({ round, trickN: 1, starter: current, turn: current, players, roomName, code: $('#roomCodeGlobal').textContent });
  });

  socket.on('bid_prompt', ({ round, seeCards, hand, min, max, sum, lastSpeaker })=>{
    const area = document.getElementById('bidsArea');
    area.innerHTML='';
    const h = document.createElement('div'); h.className='cards'; area.appendChild(h);
    if(seeCards){ hand.forEach(c => h.appendChild(cardNode(c))); } 
    else { const b=document.createElement('div'); b.className='card back'; b.innerHTML=`<div class="rank">★</div><div class="suit">${LANG==='es'?'Oculta':'Hidden'}</div>`; h.appendChild(b); }

    const row = document.createElement('div'); row.className='row';
    const inp = document.createElement('input'); inp.type='number'; inp.min=String(min); inp.max=String(max); inp.value='0'; inp.style.maxWidth='120px';
    const btn = document.createElement('button'); btn.textContent=(LANG==='es'?'Confirmar apuesta':'Confirm bid');
    const info=document.createElement('div'); info.className='pill'; info.textContent = `${(LANG==='es'?'Suma parcial':'Total so far')}: ${sum}`;
    row.append(inp, btn, info); area.appendChild(row);

    btn.onclick = ()=>{
      const v = Math.max(min, Math.min(max, (+inp.value||0)));
      socket.emit('submit_bid', { roomCode: ROOM, value: v });
    };
  });

  socket.on('r1_state', ({ roomName, order })=>{
    ORDER_CACHE = order || [];
    show('view-preround', false); show('view-play', false); show('view-bids', true);
    show('overview', true);
    document.getElementById('hdrBids').textContent = `${(LANG==='es'?'Ronda':'Round')} 1 — ${(LANG==='es'?'Instrucciones':'Instructions')}`;
    // FIX: usar comillas dobles para el apóstrofo en inglés (sin \\')
    const area = document.getElementById('bidsArea'); 
    area.innerHTML = `<p class="muted">${(LANG==='es'
      ? 'Mira las cartas de los demás y responde Sí/No.'
      : "Look at others' cards and answer Yes/No."
    )}</p>`;
  });

  socket.on('r1_prompt', ({ others, order })=>{
    const area = document.getElementById('bidsArea'); area.innerHTML='';
    const count = Object.keys(others).length;
    const title = document.createElement('h3'); 
    title.textContent = count===1 ? (LANG==='es'?'La carta de tu oponente':'Your opponent\'s card') : (LANG==='es'?'Cartas de los oponentes':'Opponents\' cards');
    area.appendChild(title);
    const wrap=document.createElement('div'); wrap.className='cards';
    // label with names
    const idToName = {}; (order||[]).forEach(o=> idToName[o.id]=o.name);
    for(const [pid,card] of Object.entries(others)){
      const holder=document.createElement('div'); holder.className='cardwrap';
      const label=document.createElement('div'); label.className='small'; label.textContent = idToName[pid] || '—';
      holder.appendChild(label);
      holder.appendChild(cardNode(card));
      wrap.appendChild(holder);
    }
    area.appendChild(wrap);
    const row=document.createElement('div'); row.className='row';
    const yes=document.createElement('button'); yes.textContent=(LANG==='es'?'Sí':'Yes');
    const no=document.createElement('button'); no.textContent=(LANG==='es'?'No':'No'); no.className='secondary';
    row.append(yes,no); area.appendChild(row);
    yes.onclick=()=> socket.emit('r1_answer', { roomCode: ROOM, answer:'YES' });
    no.onclick =()=> socket.emit('r1_answer', { roomCode: ROOM, answer:'NO'  });
  });

  socket.on('r1_reveal', ({ table, winner })=>{
    show('view-bids', false); show('view-play', true);
    show('overview', true);
    const tbox=document.getElementById('table'); tbox.innerHTML='';
    table.forEach(pl=>{ const box=document.createElement('div'); box.className='playbox'; box.appendChild(cardNode(pl.card)); tbox.appendChild(box); });
  });

  socket.on('play_state', ({ roomName, round, starter, turn, trickN, table, summary, players })=>{
    CURRENT_ROUND = round;
    PLAYERS_CACHE = players || [];
    show('view-bids', false); show('view-summary', false); show('view-play', true);
    show('overview', true);

    // Fill table
    const t=document.getElementById('table'); t.innerHTML='';
    table.forEach(pl=>{ const box=document.createElement('div'); box.className='playbox'; box.appendChild(cardNode(pl.card)); t.appendChild(box); });

    // Summary
    const sb=document.getElementById('sumBody'); sb.innerHTML='';
    summary.forEach(r=>{
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${r.name}</td><td>${r.wins}</td><td>${r.askDelta}</td><td>${r.lives}</td><td>${r.bid==null?'—':r.bid}</td>`;
      sb.appendChild(tr);
    });

    // My hand
    const mh=document.getElementById('myHand'); mh.innerHTML='';
    if(turn===socket.id){
      (MY_HAND||[]).forEach(c=> mh.appendChild(cardNode(c, ()=>{
        socket.emit('play_card', { roomCode: ROOM, card: c });
      })) );
      document.getElementById('playHint').textContent=(LANG==='es'?'Elige una carta para jugar':'Pick a card to play');
    } else {
      (MY_HAND||[]).forEach(c=> mh.appendChild(cardNode(c)) );
      document.getElementById('playHint').textContent=(LANG==='es'?'Esperando a los demás':'Waiting for other players');
    }

    // Overview bar
    renderOverview({ round, trickN, starter, turn, players, roomName, code: $('#roomCodeGlobal').textContent });
  });

  // Update my hand immediately after I play
  socket.on('your_turn', ({ hand })=>{ MY_HAND = hand; });
  socket.on('table_update', ({ pid, card })=>{
    if(pid === socket.id){
      const idx = MY_HAND.indexOf(card);
      if(idx !== -1) MY_HAND.splice(idx, 1);
      const mh = document.getElementById('myHand');
      if(mh){
        mh.innerHTML='';
        (MY_HAND||[]).forEach(c=> mh.appendChild(cardNode(c)) );
        const hint = document.getElementById('playHint');
        if(hint) hint.textContent = (LANG==='es'?'Esperando a los demás':'Waiting for other players');
      }
    }
  });

  // Hand log / mini-summary
  socket.on('trick_result', ({ plays, winner, winningCard, tieBreak })=>{
    const box = document.getElementById('handLog');
    const entry = document.createElement('div');
    entry.className='logentry';
    // list plays in order
    const ul=document.createElement('ul');
    plays.sort((a,b)=>a.order-b.order).forEach(pl=>{
      const name = (PLAYERS_CACHE.find(p=>p.id===pl.pid)||{}).name || '—';
      const rank = pl.card[0]==='T' ? '10' : pl.card[0];
      const li=document.createElement('li');
      li.textContent = `${name} → ${rank}${pl.card[1]}`;
      ul.appendChild(li);
    });
    entry.appendChild(ul);
    // reason
    const winName = (PLAYERS_CACHE.find(p=>p.id===winner.id)||{}).name || winner.name;
    const rank = winningCard[0]==='T' ? '10' : winningCard[0];
    const reason = document.createElement('div');
    reason.className='muted';
    reason.textContent = tieBreak 
      ? `${(LANG==='es')? `${winName} gana: empate en ${rank}, jugó primero.` : `${winName} wins: tie at ${rank}, played first.`}`
      : `${(LANG==='es')? `${winName} gana con ${rank}.` : `${winName} wins with ${rank}.`}`;
    entry.appendChild(reason);
    box.appendChild(entry);
    // auto-scroll
    box.scrollTop = box.scrollHeight;
  });

  socket.on('round_summary', ({ round, rows, over, winner })=>{
    show('view-play', false); show('view-summary', true);
    show('overview', true);
    const box=document.getElementById('roundBox');
    let html = `<div class="pill">${(LANG==='es'?'Ronda':'Round')} ${round} ✓</div><div class="divider"></div>`;
    html += '<table class="summary"><thead><tr><th>'+((LANG==='es')?'Jugador':'Player')+'</th><th>'+((LANG==='es')?'Manos Ganadas':'Wins')+'</th><th>'+((LANG==='es')?'Apuesta':'Bid')+'</th><th>'+((LANG==='es')?'Vidas':'Lives')+'</th><th>Status</th></tr></thead><tbody>';
    rows.forEach(r=>{ html += `<tr><td>${r.name}</td><td>${r.wins??'—'}</td><td>${r.bid??'—'}</td><td>${r.lives}</td><td>${r.eliminated?(LANG==='es'?'Fuera':'Out'):''}</td></tr>`; });
    html += '</tbody></table>';
    if(over){ html += '<div class="divider"></div><h2>'+(winner? winner.name+(LANG==='es'?' gana la partida!':' wins the game!'):(LANG==='es'?'Fin de la partida':'Game over'))+'</h2>'; document.getElementById('btnNextRound').disabled=true; } else { document.getElementById('btnNextRound').disabled=false; }
    box.innerHTML = html;
    // clear hand log for next round
    const log = document.getElementById('handLog'); if(log) log.innerHTML='';
  });

  document.getElementById('btnNextRound').onclick = ()=> socket.emit('next_round', { roomCode: ROOM });
  socket.on('error_msg', ({ message })=> toast(message));
}

// Ensure footer hidden on first load
show('overview', false);

// Initial i18n update
applyI18n();
