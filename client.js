/* =========================
   Survival Game – client.js (toast fix + router + lógica base)
   ========================= */

/* --- Guard rail CSS: cualquier #toast empieza invisible (por si quedó del HTML viejo) --- */
(() => {
  try {
    const style = document.createElement('style');
    style.textContent = `
      #toast{display:none !important; opacity:0 !important; pointer-events:none !important;}
    `;
    document.head.appendChild(style);
  } catch {}
})();

/* --- util DOM --- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const show = (el, on = true) => {
  if (!el) return;
  if (el.classList) el.classList.toggle('hidden', !on);
  else el.style.display = on ? "" : "none";
};

/* --- i18n mínimo --- */
const I18N = {
  en: {
    your_turn: "Your turn",
    waiting_for: (n) => `Waiting for ${n}…`,
    creating: "Creating room…",
    created: "Room ready",
    join_fail: "Failed to join",
    create_fail: "Failed to create room",
    settings_applied: "Settings applied",
    host_only: "Host only",
    on_fire: "You're on fire!"
  },
  es: {
    your_turn: "¡Tu turno!",
    waiting_for: (n) => `Esperando a ${n}…`,
    creating: "Creando sala…",
    created: "Sala creada",
    join_fail: "No se pudo entrar",
    create_fail: "No se pudo crear la sala",
    settings_applied: "Ajustes aplicados",
    host_only: "Solo el anfitrión",
    on_fire: "¡Estás on fire!"
  }
};
let LANG = localStorage.getItem("sg_lang") || "en";
if ($("#langSelect")) {
  $("#langSelect").value = LANG;
  $("#langSelect").addEventListener("change", (e) => {
    LANG = e.target.value;
    localStorage.setItem("sg_lang", LANG);
  });
}
const T = () => I18N[LANG] || I18N.en;

/* --- TOAST: creación perezosa + SIEMPRE oculto (bugfix) --- */
let toastEl = null;

function killStaleToast() {
  const el = document.getElementById("toast");
  if (el) {
    el.textContent = "";
    el.style.display = "none";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
  }
}
document.addEventListener("DOMContentLoaded", killStaleToast);

function toast(msg, ms = 1600) {
  if (!toastEl) {
    // Si había uno en el HTML, lo reutilizamos pero bajo nuestras reglas
    toastEl = document.getElementById("toast") || document.createElement("div");
    toastEl.id = "toast";
    Object.assign(toastEl.style, {
      position: "fixed",
      left: "50%",
      bottom: "24px",
      transform: "translateX(-50%)",
      background: "#333",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "8px",
      zIndex: 9999,
      fontFamily: "system-ui, sans-serif",
      opacity: "0",
      pointerEvents: "none",
      transition: "opacity .15s",
      display: "none",
      maxWidth: "90vw",
      textAlign: "center",
      boxShadow: "0 6px 18px rgba(0,0,0,.35)"
    });
    if (!toastEl.parentNode) document.body.appendChild(toastEl);
  }
  if (!msg) {
    // Oculta si te pasan cadena vacía por error
    toastEl.style.opacity = "0";
    toastEl.style.display = "none";
    return;
  }
  toastEl.textContent = msg;
  toastEl.style.display = "block";
  requestAnimationFrame(() => (toastEl.style.opacity = "1"));
  setTimeout(() => {
    toastEl.style.opacity = "0";
    setTimeout(() => (toastEl.style.display = "none"), 180);
  }, ms);
}

/* --- navegación entre vistas --- */
const VIEW_IDS = ["view-join", "view-lobby", "view-preround", "view-bids", "view-play", "view-summary"];
function goto(viewId) {
  const views = VIEW_IDS.map((id) => document.getElementById(id)).filter(Boolean);
  if (views.length) {
    views.forEach((v) => show(v, v.id === viewId));
    return;
  }
  // fallback por si usas .screen ids: join, lobby, …
  const screens = $$(".screen");
  if (screens.length) {
    screens.forEach((s) => show(s, s.id === viewId.replace("view-", "")));
  }
}

/* --- router por hash (#ABC123) --- */
function currentHashCode() {
  return (location.hash || "").replace("#", "").trim().toUpperCase();
}
function isRoomCode(str) {
  return /^[A-Z0-9]{4,10}$/.test(str || "");
}
function applyRouteFromHash() {
  const code = currentHashCode();
  if (isRoomCode(code)) {
    ROOM.code = code;
    if ($("#roomCodeBadge")) $("#roomCodeBadge").textContent = code;
    goto("view-lobby");
  } else {
    goto("view-join");
  }
}
window.addEventListener("hashchange", applyRouteFromHash);

/* --- socket.io --- */
const BACKEND = window.SG_BACKEND || "https://survival-game-multiplayer-production.up.railway.app";
if (!window.io) console.error("[SG] ERROR: socket.io CDN no está cargado");
const socket = io(BACKEND, {
  transports: ["websocket", "polling"],
  withCredentials: false,
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 6000
});
socket.on("connect", () => console.log("[SG] conectado ✓", { id: socket.id, url: BACKEND }));
socket.on("connect_error", (e) => console.warn("[SG] connect_error", e?.message || e));

/* --- estado --- */
let ME = { id: null, name: null, host: false };
let ROOM = { code: "", name: "", seats: 4, startLives: 7 };
let ON_FIRE = new Set();

/* --- helpers --- */
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPH[(Math.random() * ALPH.length) | 0];
  return s;
}
function setHash(code) {
  try { location.hash = "#" + code; } catch {}
}

/* --- CREATE ROOM (optimista + ACK/Evento) --- */
const btnCreate = $("#createRoomBtn") || $("#btnCreate") || $("[data-action='create']");
if (btnCreate) {
  btnCreate.onclick = () => {
    const name = ($("#playerName") || $("#name") || { value: "Player" }).value.trim() || "Player";
    const roomName = ($("#roomNameInput") || $("#roomName") || { value: "" }).value.trim();
    const seats = parseInt(($("#seatCount") || { value: "4" }).value, 10) || 4;
    const startLives = parseInt(($("#startingLives") || { value: "7" }).value, 10) || 7;

    ME.name = name; ME.host = true;
    const code = genCode(6);
    ROOM = { code, name: roomName, seats, startLives };

    setHash(code);          // muestra el lobby por router
    toast(T().creating);    // muestra un toast correcto (ya no se queda “vacío”)

    socket.timeout(3500).emit("create_room", { code, roomName, seats, startLives, name }, (err, res) => {
      if (err) {
        console.warn("[SG] create_room timeout/err", err);
        return; // mantenemos lobby optimista
      }
      if (!res || res.ok !== true) {
        toast(res?.error || T().create_fail);
        location.hash = ""; // volvemos al join
        applyRouteFromHash();
        return;
      }
      // refresco por si el server ajusta algo
      const r = res.room || {};
      ROOM.seats = r.seats || seats;
      ROOM.startLives = r.startLives || startLives;
      if ($("#roomCodeBadge")) $("#roomCodeBadge").textContent = ROOM.code;
      toast(T().created);
    });
  };
}

/* --- JOIN ROOM (optimista + ACK) --- */
const btnJoin = $("#joinRoomBtn") || $("#btnJoin") || $("[data-action='join']");
if (btnJoin) {
  btnJoin.onclick = () => {
    const name = ($("#playerName") || $("#name") || { value: "Player" }).value.trim() || "Player";
    const code = (($("#roomCode") || { value: "" }).value || "").toUpperCase();
    if (!isRoomCode(code)) return toast("Code?");

    ME.name = name; ME.host = false;
    ROOM.code = code;

    setHash(code);
    socket.timeout(3500).emit("join_room", { code, name }, (err, res) => {
      if (err) { console.warn("[SG] join_room timeout/err", err); return; }
      if (!res || res.ok !== true) {
        toast(res?.error || T().join_fail);
        location.hash = "";
        applyRouteFromHash();
      }
    });
  };
}

/* --- Eventos compatibles del servidor --- */
["room_created", "roomCreated", "created_room"].forEach((evt) => {
  socket.on(evt, (payload) => {
    if (!payload) return;
    ROOM.code = payload.code || ROOM.code;
    ROOM.name = payload.roomName || ROOM.name;
    ROOM.seats = payload.seats || ROOM.seats;
    ROOM.startLives = payload.startLives || ROOM.startLives;
    if ($("#roomCodeBadge")) $("#roomCodeBadge").textContent = ROOM.code;
    if (!isRoomCode(currentHashCode())) setHash(ROOM.code);
    goto("view-lobby");
  });
});

socket.on("lobby_update", (payload) => {
  const list = $("#playersLobby");
  if (!list || !payload || !Array.isArray(payload.players)) return;
  list.innerHTML = payload.players
    .map((p) => `<span class="pill">${p.name}${p.host ? " ⭐" : ""}</span>`)
    .join(" ");
  const imHost = !!payload.players.find((p) => p.id === socket.id && p.host);
  if ($("#hostControls")) show($("#hostControls"), imHost);
});

/* --- controles de host --- */
if ($("#btnConfigure")) {
  $("#btnConfigure").onclick = () => {
    if (!ME.host) return toast(T().host_only);
    const seats = parseInt(($("#seatCount") || { value: ROOM.seats }).value, 10) || ROOM.seats;
    const startLives = parseInt(($("#startingLives") || { value: ROOM.startLives }).value, 10) || ROOM.startLives;
    socket.emit("configure_room", { code: ROOM.code, seats, startLives });
    ROOM.seats = seats; ROOM.startLives = startLives;
    toast(T().settings_applied);
  };
}
if ($("#btnStart")) {
  $("#btnStart").onclick = () => {
    if (!ME.host) return toast(T().host_only);
    socket.emit("start_now", { code: ROOM.code });
  };
}

/* --- juego (placeholders para vistas existentes) --- */
function setTurnOwner(who) {
  const amI = !!(who && (who.id === socket.id || who.name === ME.name));
  if ($("#turnBadge")) show($("#turnBadge"), amI);
  if ($("#playHint")) $("#playHint").textContent = amI ? T().your_turn : T().waiting_for(who?.name || "…");
}
socket.on("start_play", (payload) => {
  goto("view-play");
  if (payload?.turnOwner) setTurnOwner(payload.turnOwner);
});
socket.on("turn_changed", setTurnOwner);
socket.on("round_summary", () => goto("view-summary"));

/* --- init ruta actual --- */
applyRouteFromHash();
killStaleToast(); // por si el DOM tardó y había un #toast antiguo
