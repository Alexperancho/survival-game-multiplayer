const $ = sel => document.querySelector(sel);
const show = (id, yes=true)=> document.getElementById(id).classList[yes?'remove':'add']('hidden');
const toast = (msg)=>{ const t=document.getElementById('toast'); t.textContent=msg; show('toast',true); setTimeout(()=>show('toast',false), 1600); };

let socket; let ROOM=''; let ME={ id:null, name:null, token:null, host:false };
let MY_HAND=[];

const SUITS = { S:'\u2660', H:'\u2665', D:'\u2666', C:'\u2663' };
function cardNode(code, click){
  const n=document.createElement('div');
  n.className='card ' + ((code[1]==='H'||code[1]==='D')?'red':'');
  n.innerHTML = `<div class="rank">${code[0]}</div><div class="suit">${SUITS[code[1]]}</div>`;
  if(click) n.addEventListener('click', click);
  return n;
}

function connect(){ if(!socket){ socket = io(); bindSocket(); } }

// Create room
$('#btnCreate').onclick = ()=>{
  const name = (document.getElementById('playerName').value||'Player').trim();
  if(!name){ toast('Enter your name'); return; }
  connect();
  socket.emit('create_room', { name });
};

// Join room
$('#btnJoin').onclick = ()=>{
  ROOM = (document.getElementById('roomCode').value||'').trim().toUpperCase();
  const name = (document.getElementById('playerName').value||'Player').trim();
  if(!ROOM){ toast('Enter room code'); return; }
  connect();
  const token = localStorage.getItem('sg_token_'+ROOM) || null;
  socket.emit('join_room', { roomCode: ROOM, name, token });
};

function bindSocket(){
  socket.on('room_created', ({ code, host, token, startingLives })=>{
    ROOM = code; ME.id = socket.id; ME.name = (document.getElementById('playerName').value||'Player').trim(); ME.host = host; ME.token = token;
    localStorage.setItem('sg_token_'+ROOM, token);
    document.getElementById('roomCodeBadge').textContent = code;
    show('view-join', false); show('view-lobby', true);
    show('hostControls', true);
    document.getElementById('startingLives').value = startingLives;
    updateFillHint();
  });

  socket.on('joined', ({ code, host, token, startingLives })=>{
    ROOM = code; ME.id = socket.id; ME.name = (document.getElementById('playerName').value||'Player').trim(); ME.host = host; ME.token = token;
    localStorage.setItem('sg_token_'+ROOM, token);
    document.getElementById('roomCodeBadge').textContent = code;
    if(host){ show('hostControls', true); document.getElementById('startingLives').value = startingLives; }
    show('view-join', false); show('view-lobby', true);
  });

  socket.on('room_state', ({ players, hostId, status, round, startingLives, targetSeats })=>{
    const box = document.getElementById('playersLobby'); box.innerHTML='';
    players.forEach(p=>{
      const div=document.createElement('div'); div.className='pill';
      if(p.isHost) div.innerHTML = `\u2605 ${p.name}`; else div.textContent = p.name;
      box.appendChild(div);
    });
    if(ME.id===hostId){ show('hostControls', true); }

    // Update fill hint (X / seats)
    if(typeof targetSeats==='number' && targetSeats>0){
      document.getElementById('fillHint').textContent = `Players joined: ${players.length} / ${targetSeats}. The game will auto-start when full.`;
    } else {
      document.getElementById('fillHint').textContent = 'Set number of players and lives, then share the code.';
    }
  });

  // Host config
  document.getElementById('btnConfigure').onclick = ()=>{
    const seats = +document.getElementById('seatCount').value|0;
    const lives = +document.getElementById('startingLives').value|0;
    socket.emit('configure_room', { roomCode: ROOM, seats, lives });
  };
  document.getElementById('btnStart').onclick = ()=> socket.emit('start_game', { roomCode: ROOM });

  function updateFillHint(){
    const seats = +document.getElementById('seatCount').value|0;
    document.getElementById('fillHint').textContent = `Waiting for players... target: ${seats}. It will auto-start when ${seats} have joined.`;
  }

  socket.on('preround_state', ({ round, firstSpeaker, order, players })=>{
    show('view-lobby', false); show('view-summary', false); show('view-preround', true);
    document.getElementById('hdrRound').textContent = `Round ${round}`;
    const badges = document.getElementById('orderBadges'); badges.innerHTML='';
    order.forEach((o,i)=>{ const d=document.createElement('div'); d.className='pill'; d.textContent=(i===0?'▶ ':'')+o.name; badges.appendChild(d); });
    const fs = order.find(o=>o.id===firstSpeaker); document.getElementById('firstSpeakerNote').textContent = `First speaker: ${fs? fs.name : '—'}`;
  });

  // Private hand after dealing
  socket.on('private_hand', ({ hand })=>{ MY_HAND = hand; });

  socket.on('bids_state', ({ round, current, sum, lastSpeaker, bidsPublic })=>{
    show('view-preround', false); show('view-play', false); show('view-bids', true);
    document.getElementById('hdrBids').textContent = `Round ${round} — Win Asks`;
    const area = document.getElementById('bidsArea'); area.innerHTML='';
    const meTurn = (current===socket.id);
    const p = document.createElement('div');
    p.innerHTML = `<div class="pill">Current: ${meTurn? 'You' : 'Opponent'}</div><div class="pill">Total so far: ${sum}</div>`;
    area.appendChild(p);
  });

  socket.on('bid_prompt', ({ round, seeCards, hand, min, max, sum, lastSpeaker })=>{
    const area = document.getElementById('bidsArea');
    area.innerHTML='';
    const h = document.createElement('div'); h.className='cards'; area.appendChild(h);
    if(seeCards){ hand.forEach(c => h.appendChild(cardNode(c))); } else { const b=document.createElement('div'); b.className='card back'; b.innerHTML='<div class="rank">★</div><div class="suit">Hidden</div>'; h.appendChild(b); }

    const row = document.createElement('div'); row.className='row';
    const inp = document.createElement('input'); inp.type='number'; inp.min=String(min); inp.max=String(max); inp.value='0'; inp.style.maxWidth='120px';
    const btn = document.createElement('button'); btn.textContent='Confirm bid';
    const info=document.createElement('div'); info.className='pill'; info.textContent = `Current total: ${sum}`;
    row.append(inp, btn, info); area.appendChild(row);

    btn.onclick = ()=>{
      const v = Math.max(min, Math.min(max, (+inp.value||0)));
      socket.emit('submit_bid', { roomCode: ROOM, value: v });
    };
  });

  socket.on('r1_state', ({ order })=>{
    show('view-preround', false); show('view-play', false); show('view-bids', true);
    document.getElementById('hdrBids').textContent='Round 1 — Yes / No';
    document.getElementById('bidsArea').innerHTML = '<p class="muted">Look at others\' cards and answer.</p>';
  });

  socket.on('r1_prompt', ({ others })=>{
    const area = document.getElementById('bidsArea'); area.innerHTML='';
    const wrap=document.createElement('div'); wrap.className='cards';
    for(const [pid,card] of Object.entries(others)) wrap.appendChild(cardNode(card));
    area.appendChild(wrap);
    const row=document.createElement('div'); row.className='row';
    const yes=document.createElement('button'); yes.textContent='Yes';
    const no=document.createElement('button'); no.textContent='No'; no.className='secondary';
    row.append(yes,no); area.appendChild(row);
    yes.onclick=()=> socket.emit('r1_answer', { roomCode: ROOM, answer:'YES' });
    no.onclick =()=> socket.emit('r1_answer', { roomCode: ROOM, answer:'NO'  });
  });

  socket.on('r1_reveal', ({ table, winner })=>{
    show('view-bids', false); show('view-play', true);
    document.getElementById('roundPill').textContent='Round 1';
    document.getElementById('starterPill').textContent='—';
    document.getElementById('turnPill').textContent='—';
    const t=document.getElementById('table'); t.innerHTML='';
    table.forEach(pl=>{ const box=document.createElement('div'); box.className='playbox'; box.appendChild(cardNode(pl.card)); t.appendChild(box); });
  });

  socket.on('play_state', ({ round, starter, turn, trickN, table, summary })=>{
    show('view-bids', false); show('view-summary', false); show('view-play', true);
    document.getElementById('roundPill').textContent = `Round ${round}`;
    document.getElementById('starterPill').textContent = `Starter: ${starter===socket.id? 'You' : 'Opponent'}`;
    document.getElementById('turnPill').textContent = `Turn: ${turn===socket.id? 'Your turn' : 'Waiting...'}`;

    const t=document.getElementById('table'); t.innerHTML='';
    table.forEach(pl=>{ const box=document.createElement('div'); box.className='playbox'; box.appendChild(cardNode(pl.card)); t.appendChild(box); });

    const sb=document.getElementById('sumBody'); sb.innerHTML='';
    summary.forEach(r=>{
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${r.name}</td><td>${r.wins}</td><td>${r.askDelta}</td><td>${r.lives}</td>`;
      sb.appendChild(tr);
    });

    const mh=document.getElementById('myHand'); mh.innerHTML='';
    if(turn===socket.id){
      (MY_HAND||[]).forEach(c=> mh.appendChild(cardNode(c, ()=>{
        socket.emit('play_card', { roomCode: ROOM, card: c });
      })) );
      document.getElementById('playHint').textContent='Pick a card to play';
    } else {
      (MY_HAND||[]).forEach(c=> mh.appendChild(cardNode(c)) );
      document.getElementById('playHint').textContent='Waiting for other players';
    }
  });

  socket.on('your_turn', ({ hand })=>{ MY_HAND = hand; });
  socket.on('table_update', ({ pid, card })=>{});
  socket.on('trick_result', ({ winner })=>{ toast(`${winner.name} won the hand`); });

  socket.on('round_summary', ({ round, rows, over, winner })=>{
    show('view-play', false); show('view-summary', true);
    const box=document.getElementById('roundBox');
    let html = `<div class="pill">Round ${round} complete</div><div class="divider"></div>`;
    html += '<table class="summary"><thead><tr><th>Player</th><th>Wins</th><th>Bid</th><th>Lives</th><th>Status</th></tr></thead><tbody>';
    rows.forEach(r=>{ html += `<tr><td>${r.name}</td><td>${r.wins??'—'}</td><td>${r.bid??'—'}</td><td>${r.lives}</td><td>${r.eliminated?'Out':''}</td></tr>`; });
    html += '</tbody></table>';
    if(over){ html += '<div class="divider"></div><h2>'+(winner? winner.name+' wins the game!':'Game over')+'</h2>'; document.getElementById('btnNextRound').disabled=true; } else { document.getElementById('btnNextRound').disabled=false; }
    box.innerHTML = html;
  });

  document.getElementById('btnNextRound').onclick = ()=> socket.emit('next_round', { roomCode: ROOM });
  socket.on('error_msg', ({ message })=> toast(message));
}
