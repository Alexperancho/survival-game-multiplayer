// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// ----------------- Game logic -----------------
const RANKS = ['A','2','3','4','5','6','7','8','9','T','J','Q','K'];
const RANK_VAL = Object.fromEntries(RANKS.map((r,i)=>[r,i+1])); // A=1 lowest
const SUITS = ['S','H','D','C'];
const deck52 = ()=>{ const d=[]; for(const s of SUITS) for(const r of RANKS) d.push(r+s); return d };
const shuffle = arr => { for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr };

// roomCode -> roomState
const rooms = new Map();

function ensureRoom(code){
  if(!rooms.has(code)){
    rooms.set(code, {
      code,
      roomName: null,
      status: 'lobby', // lobby | preround | bids | play | summary | over
      hostId: null,
      startingLives: 7,
      targetSeats: null,            // objetivo de asientos
      settingsApplied: false,       // el host hizo Apply settings
      round: 5,
      firstRound: true,
      lastFirstSpeaker: null,
      firstSpeaker: null,
      players: new Map(),           // socketId -> player
      order: [],                    // orden de habla para la ronda
      deck: [],
      bidding: { order: [], idx: 0, sum: 0 },
      play: { starter: null, turn: null, trickN: 1, plays: []}
    });
  }
  return rooms.get(code);
}

function playerList(room){
  return Array.from(room.players.values()).map(p=>({
    id: p.id, name: p.name, lives: p.lives, eliminated: p.eliminated,
    isHost: room.hostId===p.id, bid: p.bid ?? null, wins: p.wins ?? 0
  }));
}

function aliveIds(room){
  return Array.from(room.players.values()).filter(p=>!p.eliminated).map(p=>p.id);
}

function speakingOrderFrom(room, firstId){
  const alive = aliveIds(room);
  const startIdx = alive.indexOf(firstId);
  const out=[]; for(let i=0;i<alive.length;i++) out.push(alive[(startIdx+i)%alive.length]);
  return out;
}

function nextAliveFrom(room, afterId){
  const alive = aliveIds(room); if(alive.length===0) return null;
  const idx = alive.indexOf(afterId);
  return alive[(idx+1)%alive.length];
}

function deal(room){
  room.deck = shuffle(deck52());
  for(const p of room.players.values()){
    if(p.eliminated) continue;
    p.hand=[]; p.wins=0; p.bid=null; p.r1Guess=null;
  }
  const per = room.round;
  const alive = aliveIds(room);
  for(let k=0;k<per;k++){
    for(const id of alive){
      const p = room.players.get(id);
      p.hand.push(room.deck.pop());
    }
  }
}

function chooseFirstSpeaker(room){
  const alive = aliveIds(room);
  if(alive.length===0) return null;
  if(room.firstRound){
    const pick = alive[Math.floor(Math.random()*alive.length)];
    room.firstSpeaker = pick;
    room.firstRound = false;
  } else {
    const startFrom = room.lastFirstSpeaker ?? alive[0];
    room.firstSpeaker = nextAliveFrom(room, startFrom);
  }
}

function beginPreRound(room){
  if(aliveIds(room).length<=1){ endGame(room); return; }
  room.status='preround';
  chooseFirstSpeaker(room);
  deal(room);
  room.order = speakingOrderFrom(room, room.firstSpeaker);
  io.to(room.code).emit('preround_state', {
    roomName: room.roomName,
    round: room.round,
    firstSpeaker: room.firstSpeaker,
    order: room.order.map(id=> ({ id, name: room.players.get(id).name })),
    players: playerList(room)
  });
  // mano privada a cada jugador
  for(const p of room.players.values()){
    io.to(p.id).emit('private_hand', { hand: p.hand });
  }
}

function beginBids(room){
  if(room.round===1){
    beginRound1YesNo(room);
    return;
  }
  room.status='bids';
  room.bidding = { order: room.order.slice(), idx:0, sum:0 };
  promptBid(room);
}

function promptBid(room){
  const ord = room.bidding.order; const idx = room.bidding.idx;
  const pid = ord[idx]; const last = idx===ord.length-1;
  io.to(room.code).emit('bids_state', {
    roomName: room.roomName,
    round: room.round,
    current: pid,
    sum: room.bidding.sum,
    lastSpeaker: last,
    bids: ord.map(id=>({ id, name: room.players.get(id).name, bid: room.players.get(id).bid })),
    players: playerList(room)
  });
  const p = room.players.get(pid);
  io.to(pid).emit('bid_prompt', {
    round: room.round,
    seeCards: room.round!==2,
    hand: p.hand,
    min: 0, max: room.round,
    sum: room.bidding.sum,
    lastSpeaker: last
  });
}

function beginRound1YesNo(room){
  room.status='bids';
  const order = room.order.slice();
  io.to(room.code).emit('r1_state', { 
    roomName: room.roomName,
    order: order.map(id=>({id, name: room.players.get(id).name})) 
  });
  // a cada jugador le mostramos la carta de los demás
  for(const pid of order){
    const others = {};
    for(const qid of order){ if(qid===pid) continue; others[qid] = room.players.get(qid).hand[0]; }
    io.to(pid).emit('r1_prompt', { others, order: order.map(x=>({id:x.id,name:room.players.get(x.id).name})) });
  }
}

function summarySnapshot(room){
  return aliveIds(room).map(id=>{
    const p = room.players.get(id);
    const askDelta = (room.round===1? '-' : (p.bid - p.wins));
    return { id, name:p.name, wins:p.wins, askDelta, lives:p.lives, bid: p.bid ?? null };
  });
}

function broadcastPlay(room){
  io.to(room.code).emit('play_state', {
    roomName: room.roomName,
    round: room.round,
    starter: room.play.starter,
    turn: room.play.turn,
    trickN: room.play.trickN,
    table: room.play.plays.map(pl => ({ pid: pl.pid, card: pl.card })),
    summary: summarySnapshot(room),
    players: playerList(room)
  });
}

function beginPlay(room){
  room.status='play';
  room.play = { starter: room.firstSpeaker, turn: room.firstSpeaker, trickN:1, plays:[] };
  broadcastPlay(room);
  io.to(room.play.turn).emit('your_turn', { hand: room.players.get(room.play.turn).hand });
}

function resolveTrick(room){
  const plays = room.play.plays;
  let maxRank = -1; plays.forEach(pl=>{ const r=RANK_VAL[pl.card[0]]; if(r>maxRank) maxRank=r; });
  const topList = plays.filter(pl => RANK_VAL[pl.card[0]]===maxRank).sort((a,b)=> a.order-b.order);
  const top = topList[0];
  const winner = room.players.get(top.pid);
  winner.wins++;

  io.to(room.code).emit('trick_result', { 
    plays: plays.map(pl => ({ pid: pl.pid, card: pl.card, order: pl.order })),
    winner: { id:winner.id, name:winner.name },
    winningCard: top.card,
    tieBreak: topList.length>1
  });

  room.play.starter = winner.id;
  room.play.turn = winner.id;
  room.play.plays = [];

  const anyLeft = aliveIds(room).some(id=> room.players.get(id).hand.length>0 );
  if(anyLeft){
    room.play.trickN++;
    broadcastPlay(room);
    io.to(room.play.turn).emit('your_turn', { hand: room.players.get(room.play.turn).hand });
  } else {
    endRound(room);
  }
}

function resolveRound1(room){
  const alive = aliveIds(room);
  const plays = alive.map((id,idx)=> ({ pid:id, card: room.players.get(id).hand[0], order: idx }));
  let maxRank=-1; plays.forEach(pl=>{ const r=RANK_VAL[pl.card[0]]; if(r>maxRank) maxRank=r; });
  const topList = plays.filter(pl=> RANK_VAL[pl.card[0]]===maxRank).sort((a,b)=> a.order-b.order);
  const top = topList[0];
  const winnerId = top.pid;

  for(const id of alive){
    const p = room.players.get(id);
    const predictedWin = (p.r1Guess==='YES');
    const actuallyWin = (id===winnerId);
    if(predictedWin !== actuallyWin) p.lives = Math.max(0, p.lives-1);
  }

  io.to(room.code).emit('r1_reveal', {
    table: plays.map(pl=> ({ pid: pl.pid, card: pl.card })),
    winner: { id: winnerId, name: room.players.get(winnerId).name }
  });

  endRound(room);
}

function endRound(room){
  if(room.round!==1){
    for(const id of aliveIds(room)){
      const p = room.players.get(id);
      const bid = (p.bid ?? 0);
      const loss = Math.abs(p.wins - bid);
      p.lives = Math.max(0, p.lives - loss);
    }
  }
  for(const p of room.players.values()) if(p.lives<=0) p.eliminated = true;

  room.status='summary';
  room.lastFirstSpeaker = room.firstSpeaker;

  const survivors = aliveIds(room);
  const over = survivors.length<=1;
  if(over){
    room.status='over';
  }

  io.to(room.code).emit('round_summary', {
    round: room.round,
    rows: Array.from(room.players.values()).map(p=> ({ id:p.id, name:p.name, wins:p.wins, bid:(p.bid??null), lives:p.lives, eliminated:p.eliminated })),
    over,
    winner: over? (survivors[0]? { id:survivors[0], name: room.players.get(survivors[0]).name } : null) : null
  });
}

function advanceRound(room){
  room.round = (room.round>1? room.round-1 : 5);
  beginPreRound(room);
}

function generateRoomCode(){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code='';
  do { code = Array.from({length:6}, ()=> alphabet[Math.floor(Math.random()*(alphabet.length))]).join(''); } while(rooms.has(code));
  return code;
}

// ----------------- Sockets -----------------
io.on('connection', (socket)=>{
  socket.on('create_room', ({ name, roomName })=>{
    const code = generateRoomCode();
    const room = ensureRoom(code);
    room.roomName = (roomName||'').toString().slice(0,40) || null;

    const player = {
      id: socket.id,
      name: (name||'Player').slice(0,20),
      lives: room.startingLives,
      eliminated: false,
      hand: [], wins: 0, bid: null, r1Guess: null,
      token: cryptoRandom()
    };
    room.players.set(socket.id, player);
    if(!room.hostId) room.hostId = socket.id;

    socket.join(code);
    socket.emit('room_created', { code, host: true, token: player.token, startingLives: room.startingLives, roomName: room.roomName });
    io.to(code).emit('room_state', { roomName: room.roomName, players: playerList(room), hostId: room.hostId, status: room.status, round: room.round, startingLives: room.startingLives, targetSeats: room.targetSeats });
  });

  socket.on('join_room', ({ roomCode, name, token })=>{
    const code = (roomCode||'').trim().toUpperCase(); if(!code) return;
    const room = ensureRoom(code);

    // v1: no espectadores; bloquear entradas si no estamos en lobby
    if(room.status !== 'lobby'){
      socket.emit('error_msg', { message: 'La partida ya ha comenzado. / Game already started.' });
      return;
    }

    // Reconexion por token
    let attached = false;
    if(token){
      for(const p of room.players.values()){
        if(p.token===token){
          room.players.delete(p.id);
          p.id = socket.id;
          room.players.set(socket.id, p);
          attached=true;
          break;
        }
      }
    }

    if(!attached){
      const player = {
        id: socket.id,
        name: (name||'Player').slice(0,20),
        lives: room.startingLives,
        eliminated: false,
        hand: [], wins: 0, bid: null, r1Guess: null,
        token: cryptoRandom()
      };
      room.players.set(socket.id, player);
      if(!room.hostId) room.hostId = socket.id;
    }

    socket.join(code);
    socket.emit('joined', { code, host: room.hostId===socket.id, token: room.players.get(socket.id).token, startingLives: room.startingLives, roomName: room.roomName });
    io.to(code).emit('room_state', { roomName: room.roomName, players: playerList(room), hostId: room.hostId, status: room.status, round: room.round, startingLives: room.startingLives, targetSeats: room.targetSeats });

    // Auto-start cuando se llena DESPUÉS de Apply settings
    if(room.status==='lobby' && room.settingsApplied && typeof room.targetSeats==='number' && room.players.size >= room.targetSeats){
      io.to(room.code).emit('error_msg', { message: '¡Sala completa! Comienza la partida…' });
      setTimeout(()=>{
        room.round=5; room.firstRound=true; room.lastFirstSpeaker=null;
        beginPreRound(room);
        setTimeout(()=> beginBids(room), 200);
      }, 800);
    }
  });

  // Host configura asientos + vidas
  socket.on('configure_room', ({ roomCode, seats, lives })=>{
    const room = rooms.get(roomCode); if(!room || room.hostId!==socket.id || room.status!=='lobby') return;
    const minSeats = Math.max(2, room.players.size);
    const S = Math.min(10, Math.max(minSeats, seats|0));
    const L = Math.max(1, Math.min(99, lives|0));
    room.targetSeats = S;
    room.startingLives = L;
    room.settingsApplied = true;
    for(const p of room.players.values()) if(!p.eliminated) p.lives=L;
    io.to(room.code).emit('room_state', { roomName: room.roomName, players: playerList(room), hostId: room.hostId, status: room.status, round: room.round, startingLives:L, targetSeats:S });

    // Auto-start si ya está lleno
    if(room.players.size >= S){
      io.to(room.code).emit('error_msg', { message: '¡Sala completa! Comienza la partida…' });
      setTimeout(()=>{
        room.round=5; room.firstRound=true; room.lastFirstSpeaker=null;
        beginPreRound(room);
        setTimeout(()=> beginBids(room), 200);
      }, 800);
    }
  });

  // Manual start
  socket.on('start_game', ({ roomCode })=>{
    const room = rooms.get(roomCode); if(!room || room.hostId!==socket.id) return;
    room.round=5; room.firstRound=true; room.lastFirstSpeaker=null;
    beginPreRound(room);
    setTimeout(()=> beginBids(room), 200);
  });

  socket.on('submit_bid', ({ roomCode, value })=>{
    const room = rooms.get(roomCode); if(!room || room.status!=='bids' || room.round===1) return;
    const ord = room.bidding.order; const idx = room.bidding.idx; const pid = ord[idx];
    if(pid!==socket.id) return;
    let v = Math.max(0, Math.min(room.round, value|0));
    const last = idx===ord.length-1;
    if(last && room.bidding.sum + v === room.round){ io.to(socket.id).emit('error_msg',{message:"You're a fool! Pick a different number."}); return; }
    const p = room.players.get(pid); p.bid = v; room.bidding.sum += v;
    room.bidding.idx++;
    if(room.bidding.idx < ord.length){ promptBid(room); } else { beginPlay(room); }
    io.to(room.code).emit('bids_state', {
      roomName: room.roomName,
      round: room.round,
      current: ord[room.bidding.idx] ?? null,
      sum: room.bidding.sum,
      lastSpeaker: room.bidding.idx===ord.length-1,
      bids: ord.map(id=>({ id, name: room.players.get(id).name, bid: room.players.get(id).bid })),
      players: playerList(room)
    });
  });

  socket.on('r1_answer', ({ roomCode, answer })=>{
    const room = rooms.get(roomCode); if(!room || room.status!=='bids' || room.round!==1) return;
    if(!room.players.has(socket.id)) return;
    const p = room.players.get(socket.id);
    if(answer!=='YES' && answer!=='NO') return;
    p.r1Guess = answer;
    const alive = aliveIds(room);
    const allGuessed = alive.every(id=>{
      const g = room.players.get(id).r1Guess; return g==='YES' || g==='NO';
    });
    if(allGuessed) resolveRound1(room);
  });

  socket.on('play_card', ({ roomCode, card })=>{
    const room = rooms.get(roomCode); if(!room || room.status!=='play') return;
    if(room.play.turn!==socket.id) return;
    const p = room.players.get(socket.id);
    const idx = p.hand.indexOf(card); if(idx===-1){ io.to(socket.id).emit('error_msg',{message:"You don't have that card."}); return; }
    p.hand.splice(idx,1);
    room.play.plays.push({ pid: socket.id, card, order: room.play.plays.length });
    io.to(room.code).emit('table_update', { pid: socket.id, card });

    const need = aliveIds(room).length;
    if(room.play.plays.length < need){
      room.play.turn = nextAliveFrom(room, socket.id);
      broadcastPlay(room);
      io.to(room.play.turn).emit('your_turn', { hand: room.players.get(room.play.turn).hand });
    } else {
      resolveTrick(room);
    }
  });

  socket.on('next_round', ({ roomCode })=>{
    const room = rooms.get(roomCode); if(!room || room.hostId!==socket.id || (room.status!=='summary' && room.status!=='over')) return;
    if(room.status==='over') return;
    advanceRound(room);
    setTimeout(()=> beginBids(room), 250);
  });

  socket.on('disconnect', ()=>{
    // mantener token para reconexión sencilla
  });
});

function endGame(room){
  room.status='over';
  const alive = aliveIds(room);
  io.to(room.code).emit('round_summary', {
    round: room.round,
    rows: Array.from(room.players.values()).map(p=> ({ id:p.id, name:p.name, wins:p.wins, bid:(p.bid??null), lives:p.lives, eliminated:p.eliminated })),
    over: true,
    winner: alive[0]? { id: alive[0], name: room.players.get(alive[0]).name } : null
  });
}

function cryptoRandom(){
  return Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
}

server.listen(PORT, ()=> console.log('Server running on :' + PORT));
