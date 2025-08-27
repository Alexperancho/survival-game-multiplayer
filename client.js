/* =========================
   Survival Game – client.js (optimizado y mejorado)
   ========================= */

/* --- Guard rail CSS: cualquier #toast empieza invisible --- */
(() => {
  try {
    const style = document.createElement('style');
    style.textContent = `
      #toast{display:none !important; opacity:0 !important; pointer-events:none !important;}
      .screen-transition { transition: opacity 0.3s ease-in-out; }
      .pill { 
        display: inline-block; 
        padding: 4px 8px; 
        margin: 2px; 
        background: #f0f0f0; 
        border-radius: 12px; 
        font-size: 14px; 
      }
      .loading-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid #ccc;
        border-radius: 50%;
        border-top-color: #333;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .error-msg { color: #e74c3c; background: #fdf2f2; padding: 8px; border-radius: 4px; }
      .success-msg { color: #27ae60; background: #f2fdf5; padding: 8px; border-radius: 4px; }
    `;
    document.head.appendChild(style);
  } catch (e) {
    console.warn('[SG] Could not inject CSS:', e);
  }
})();

/* --- Utilidades DOM mejoradas --- */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const show = (el, visible = true) => {
  if (!el) return;
  if (el.classList) {
    el.classList.toggle('hidden', !visible);
  } else {
    el.style.display = visible ? "" : "none";
  }
};

const fadeIn = (el, duration = 300) => {
  if (!el) return;
  el.style.opacity = '0';
  el.style.display = 'block';
  el.offsetHeight; // force reflow
  el.style.transition = `opacity ${duration}ms ease-in-out`;
  el.style.opacity = '1';
};

const fadeOut = (el, duration = 300) => {
  if (!el) return;
  el.style.transition = `opacity ${duration}ms ease-in-out`;
  el.style.opacity = '0';
  setTimeout(() => {
    el.style.display = 'none';
  }, duration);
};

// Debounce para evitar múltiples llamadas rápidas
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/* --- Sistema de i18n mejorado --- */
const I18N = {
  en: {
    your_turn: "Your turn",
    waiting_for: (name) => `Waiting for ${name}…`,
    creating: "Creating room…",
    created: "Room created successfully",
    join_fail: "Failed to join room",
    create_fail: "Failed to create room",
    settings_applied: "Settings applied",
    host_only: "Host only action",
    on_fire: "You're on fire!",
    connecting: "Connecting…",
    connected: "Connected",
    disconnected: "Connection lost",
    reconnecting: "Reconnecting…",
    invalid_room_code: "Invalid room code format",
    room_full: "Room is full",
    game_started: "Game has started",
    player_joined: (name) => `${name} joined`,
    player_left: (name) => `${name} left`,
    error_occurred: "An error occurred",
    try_again: "Try again",
    loading: "Loading…"
  },
  es: {
    your_turn: "¡Tu turno!",
    waiting_for: (name) => `Esperando a ${name}…`,
    creating: "Creando sala…",
    created: "Sala creada exitosamente",
    join_fail: "No se pudo unir a la sala",
    create_fail: "No se pudo crear la sala",
    settings_applied: "Configuración aplicada",
    host_only: "Acción solo para anfitrión",
    on_fire: "¡Estás on fire!",
    connecting: "Conectando…",
    connected: "Conectado",
    disconnected: "Conexión perdida",
    reconnecting: "Reconectando…",
    invalid_room_code: "Formato de código inválido",
    room_full: "La sala está llena",
    game_started: "El juego ha comenzado",
    player_joined: (name) => `${name} se unió`,
    player_left: (name) => `${name} se fue`,
    error_occurred: "Ocurrió un error",
    try_again: "Intentar de nuevo",
    loading: "Cargando…"
  }
};

// Gestión de idioma mejorada
class LanguageManager {
  constructor() {
    this.lang = this.getSavedLanguage();
    this.init();
  }

  getSavedLanguage() {
    try {
      return localStorage.getItem("sg_lang") || navigator.language?.split('-')[0] || "en";
    } catch {
      return "en";
    }
  }

  init() {
    const langSelect = $("#langSelect");
    if (langSelect) {
      langSelect.value = this.lang;
      langSelect.addEventListener("change", (e) => {
        this.setLanguage(e.target.value);
      });
    }
  }

  setLanguage(lang) {
    this.lang = lang;
    try {
      localStorage.setItem("sg_lang", lang);
    } catch (e) {
      console.warn('[SG] Could not save language:', e);
    }
    // Trigger re-render of UI text if needed
    this.updateUITexts();
  }

  t(key, ...args) {
    const translations = I18N[this.lang] || I18N.en;
    const value = translations[key];
    return typeof value === 'function' ? value(...args) : value || key;
  }

  updateUITexts() {
    // Update dynamic texts in the UI
    const elements = $$('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.t(key);
    });
  }
}

const lang = new LanguageManager();

/* --- Sistema de toast mejorado --- */
class ToastManager {
  constructor() {
    this.toastEl = null;
    this.queue = [];
    this.currentTimeout = null;
    this.init();
  }

  init() {
    this.killStaleToast();
    document.addEventListener("DOMContentLoaded", () => this.killStaleToast());
  }

  killStaleToast() {
    const el = document.getElementById("toast");
    if (el) {
      el.textContent = "";
      el.style.display = "none";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
    }
  }

  createToastElement() {
    if (!this.toastEl) {
      this.toastEl = document.getElementById("toast") || document.createElement("div");
      this.toastEl.id = "toast";
      
      Object.assign(this.toastEl.style, {
        position: "fixed",
        left: "50%",
        bottom: "24px",
        transform: "translateX(-50%)",
        background: "#333",
        color: "#fff",
        padding: "12px 16px",
        borderRadius: "8px",
        zIndex: 9999,
        fontFamily: "system-ui, -apple-system, sans-serif",
        opacity: "0",
        pointerEvents: "none",
        transition: "opacity 0.3s ease-in-out",
        display: "none",
        maxWidth: "90vw",
        textAlign: "center",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        fontSize: "14px",
        fontWeight: "500"
      });
      
      if (!this.toastEl.parentNode) {
        document.body.appendChild(this.toastEl);
      }
    }
    return this.toastEl;
  }

  show(message, duration = 2000, type = 'default') {
    if (!message) return;
    
    // Clear current timeout
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }

    const toast = this.createToastElement();
    
    // Set message and styling based on type
    toast.textContent = message;
    const colors = {
      default: { bg: '#333', color: '#fff' },
      success: { bg: '#27ae60', color: '#fff' },
      error: { bg: '#e74c3c', color: '#fff' },
      warning: { bg: '#f39c12', color: '#fff' }
    };
    
    const style = colors[type] || colors.default;
    toast.style.background = style.bg;
    toast.style.color = style.color;
    
    // Show toast
    toast.style.display = "block";
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
    });
    
    // Hide after duration
    this.currentTimeout = setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => {
        toast.style.display = "none";
      }, 300);
    }, duration);
  }

  error(message, duration = 3000) {
    this.show(message, duration, 'error');
  }

  success(message, duration = 2000) {
    this.show(message, duration, 'success');
  }

  warning(message, duration = 2500) {
    this.show(message, duration, 'warning');
  }
}

const toast = new ToastManager();

/* --- Sistema de navegación mejorado --- */
const VIEW_IDS = ["view-join", "view-lobby", "view-preround", "view-bids", "view-play", "view-summary"];

class ViewManager {
  constructor() {
    this.currentView = null;
    this.history = [];
    this.maxHistoryLength = 10;
  }

  goto(viewId, addToHistory = true) {
    const views = VIEW_IDS.map(id => document.getElementById(id)).filter(Boolean);
    
    if (views.length) {
      views.forEach(view => {
        if (view.id === viewId) {
          fadeIn(view);
        } else {
          show(view, false);
        }
      });
    } else {
      // Fallback para .screen
      const screens = $$(".screen");
      if (screens.length) {
        const targetId = viewId.replace("view-", "");
        screens.forEach(screen => {
          if (screen.id === targetId) {
            fadeIn(screen);
          } else {
            show(screen, false);
          }
        });
      }
    }

    // Gestión de historial
    if (addToHistory && this.currentView && this.currentView !== viewId) {
      this.history.push(this.currentView);
      if (this.history.length > this.maxHistoryLength) {
        this.history.shift();
      }
    }

    this.currentView = viewId;
    console.log(`[SG] Navigated to: ${viewId}`);
  }

  back() {
    if (this.history.length > 0) {
      const previousView = this.history.pop();
      this.goto(previousView, false);
      return true;
    }
    return false;
  }

  getCurrentView() {
    return this.currentView;
  }
}

const viewManager = new ViewManager();

/* --- Router mejorado con validación --- */
class Router {
  constructor() {
    this.init();
  }

  init() {
    window.addEventListener("hashchange", () => this.applyRouteFromHash());
    // Initial route application
    setTimeout(() => this.applyRouteFromHash(), 0);
  }

  getCurrentHashCode() {
    return (location.hash || "").replace("#", "").trim().toUpperCase();
  }

  isValidRoomCode(code) {
    return /^[A-Z0-9]{4,10}$/.test(code || "");
  }

  applyRouteFromHash() {
    const code = this.getCurrentHashCode();
    
    if (this.isValidRoomCode(code)) {
      gameState.setRoomCode(code);
      if ($("#roomCodeBadge")) {
        $("#roomCodeBadge").textContent = code;
      }
      viewManager.goto("view-lobby");
    } else {
      viewManager.goto("view-join");
    }
  }

  setHash(code) {
    try {
      if (this.isValidRoomCode(code)) {
        location.hash = "#" + code;
      }
    } catch (e) {
      console.warn('[SG] Could not set hash:', e);
    }
  }
}

const router = new Router();

/* --- Gestión de estado mejorada --- */
class GameState {
  constructor() {
    this.me = { id: null, name: null, host: false };
    this.room = { code: "", name: "", seats: 4, startLives: 7 };
    this.players = [];
    this.onFire = new Set();
    this.connectionState = 'disconnected';
    this.gamePhase = 'lobby';
  }

  setPlayer(data) {
    Object.assign(this.me, data);
  }

  setRoom(data) {
    Object.assign(this.room, data);
  }

  setRoomCode(code) {
    this.room.code = code;
  }

  setPlayers(players) {
    this.players = Array.isArray(players) ? players : [];
  }

  addPlayerOnFire(playerId) {
    this.onFire.add(playerId);
  }

  removePlayerOnFire(playerId) {
    this.onFire.delete(playerId);
  }

  isPlayerOnFire(playerId) {
    return this.onFire.has(playerId);
  }

  setConnectionState(state) {
    this.connectionState = state;
    this.updateConnectionUI();
  }

  updateConnectionUI() {
    const statusEl = $("#connectionStatus");
    if (statusEl) {
      const states = {
        connected: { text: lang.t('connected'), class: 'success-msg' },
        connecting: { text: lang.t('connecting'), class: 'warning-msg' },
        disconnected: { text: lang.t('disconnected'), class: 'error-msg' },
        reconnecting: { text: lang.t('reconnecting'), class: 'warning-msg' }
      };
      
      const state = states[this.connectionState] || states.disconnected;
      statusEl.textContent = state.text;
      statusEl.className = state.class;
    }
  }

  setGamePhase(phase) {
    this.gamePhase = phase;
    console.log(`[SG] Game phase: ${phase}`);
  }
}

const gameState = new GameState();

/* --- Generador de códigos mejorado --- */
class CodeGenerator {
  constructor() {
    this.alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Sin caracteres confusos
  }

  generate(length = 6) {
    let code = "";
    for (let i = 0; i < length; i++) {
      code += this.alphabet[Math.floor(Math.random() * this.alphabet.length)];
    }
    return code;
  }

  isValid(code) {
    return /^[A-Z0-9]{4,10}$/.test(code || "");
  }
}

const codeGen = new CodeGenerator();

/* --- Conexión WebSocket mejorada --- */
class SocketManager {
  constructor() {
    this.socket = null;
    this.backend = window.SG_BACKEND || "https://survival-game-multiplayer-production.up.railway.app";
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.init();
  }

  init() {
    if (!window.io) {
      console.error("[SG] ERROR: socket.io CDN no está cargado");
      toast.error("Socket.io library not loaded");
      return;
    }

    this.socket = io(this.backend, {
      transports: ["websocket", "polling"],
      withCredentials: false,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      timeout: 6000
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.socket.on("connect", () => {
      console.log("[SG] ✓ Connected", { id: this.socket.id, url: this.backend });
      gameState.setConnectionState('connected');
      gameState.setPlayer({ id: this.socket.id });
      this.reconnectAttempts = 0;
    });

    this.socket.on("connect_error", (error) => {
      console.warn("[SG] Connection error:", error?.message || error);
      gameState.setConnectionState('disconnected');
      toast.error(lang.t('error_occurred'));
    });

    this.socket.on("disconnect", () => {
      console.log("[SG] Disconnected");
      gameState.setConnectionState('disconnected');
    });

    this.socket.on("reconnect", () => {
      console.log("[SG] Reconnected");
      gameState.setConnectionState('connected');
      toast.success(lang.t('connected'));
    });

    this.socket.on("reconnect_attempt", (attempt) => {
      console.log(`[SG] Reconnection attempt ${attempt}`);
      gameState.setConnectionState('reconnecting');
    });

    this.socket.on("reconnect_error", (error) => {
      console.warn("[SG] Reconnection error:", error);
    });

    this.socket.on("reconnect_failed", () => {
      console.error("[SG] Reconnection failed");
      gameState.setConnectionState('disconnected');
      toast.error("Connection failed. Please refresh the page.");
    });

    // Game event listeners
    this.setupGameEventListeners();
  }

  setupGameEventListeners() {
    // Room creation events (multiple names for compatibility)
    ["room_created", "roomCreated", "created_room"].forEach(event => {
      this.socket.on(event, (payload) => {
        if (!payload) return;
        
        gameState.setRoom({
          code: payload.code || gameState.room.code,
          name: payload.roomName || gameState.room.name,
          seats: payload.seats || gameState.room.seats,
          startLives: payload.startLives || gameState.room.startLives
        });

        if ($("#roomCodeBadge")) {
          $("#roomCodeBadge").textContent = gameState.room.code;
        }

        if (!router.isValidRoomCode(router.getCurrentHashCode())) {
          router.setHash(gameState.room.code);
        }

        viewManager.goto("view-lobby");
        toast.success(lang.t('created'));
      });
    });

    // Lobby updates
    this.socket.on("lobby_update", (payload) => {
      if (!payload || !Array.isArray(payload.players)) return;

      gameState.setPlayers(payload.players);
      this.updateLobbyUI(payload.players);

      // Check if current player is host
      const currentPlayer = payload.players.find(p => p.id === this.socket.id);
      if (currentPlayer) {
        gameState.setPlayer({ host: currentPlayer.host });
        this.updateHostControls(currentPlayer.host);
      }
    });

    // Game state events
    this.socket.on("start_play", (payload) => {
      gameState.setGamePhase('playing');
      viewManager.goto("view-play");
      
      if (payload?.turnOwner) {
        this.setTurnOwner(payload.turnOwner);
      }
    });

    this.socket.on("turn_changed", (payload) => {
      this.setTurnOwner(payload);
    });

    this.socket.on("round_summary", (payload) => {
      gameState.setGamePhase('summary');
      viewManager.goto("view-summary");
    });

    // Player events
    this.socket.on("player_joined", (payload) => {
      if (payload?.player?.name) {
        toast.success(lang.t('player_joined', payload.player.name));
      }
    });

    this.socket.on("player_left", (payload) => {
      if (payload?.player?.name) {
        toast.warning(lang.t('player_left', payload.player.name));
      }
    });

    // Error handling
    this.socket.on("error", (payload) => {
      const message = payload?.message || payload?.error || lang.t('error_occurred');
      toast.error(message);
    });
  }

  updateLobbyUI(players) {
    const list = $("#playersLobby");
    if (!list) return;

    list.innerHTML = players
      .map(player => `
        <span class="pill ${player.host ? 'host-pill' : ''}" 
              data-player-id="${player.id}">
          ${player.name}${player.host ? ' ⭐' : ''}
        </span>
      `)
      .join(" ");
  }

  updateHostControls(isHost) {
    const controls = $("#hostControls");
    if (controls) {
      show(controls, isHost);
    }
  }

  setTurnOwner(turnOwner) {
    if (!turnOwner) return;

    const isMyTurn = turnOwner.id === this.socket.id || turnOwner.name === gameState.me.name;
    
    const turnBadge = $("#turnBadge");
    const playHint = $("#playHint");
    
    if (turnBadge) show(turnBadge, isMyTurn);
    if (playHint) {
      playHint.textContent = isMyTurn 
        ? lang.t('your_turn') 
        : lang.t('waiting_for', turnOwner.name || "…");
    }

    // Add visual feedback
    if (isMyTurn) {
      toast.success(lang.t('your_turn'), 1000);
    }
  }

  emit(event, data, callback) {
    if (this.socket && this.socket.connected) {
      if (callback) {
        this.socket.timeout(5000).emit(event, data, callback);
      } else {
        this.socket.emit(event, data);
      }
    } else {
      toast.error("Not connected to server");
      if (callback) callback(new Error("Not connected"));
    }
  }
}

const socketManager = new SocketManager();

/* --- Controladores de UI mejorados --- */
class UIController {
  constructor() {
    this.init();
  }

  init() {
    this.setupCreateRoomButton();
    this.setupJoinRoomButton();
    this.setupHostControls();
    this.setupFormValidation();
  }

  setupCreateRoomButton() {
    const btnCreate = $("#createRoomBtn") || $("#btnCreate") || $("[data-action='create']");
    if (!btnCreate) return;

    btnCreate.addEventListener("click", debounce(() => {
      this.handleCreateRoom();
    }, 500));
  }

  setupJoinRoomButton() {
    const btnJoin = $("#joinRoomBtn") || $("#btnJoin") || $("[data-action='join']");
    if (!btnJoin) return;

    btnJoin.addEventListener("click", debounce(() => {
      this.handleJoinRoom();
    }, 500));
  }

  setupHostControls() {
    const btnConfigure = $("#btnConfigure");
    const btnStart = $("#btnStart");

    if (btnConfigure) {
      btnConfigure.addEventListener("click", () => {
        this.handleConfigureRoom();
      });
    }

    if (btnStart) {
      btnStart.addEventListener("click", () => {
        this.handleStartGame();
      });
    }
  }

  setupFormValidation() {
    // Real-time validation for room code input
    const roomCodeInput = $("#roomCode");
    if (roomCodeInput) {
      roomCodeInput.addEventListener("input", (e) => {
        const value = e.target.value.toUpperCase();
        e.target.value = value;
        
        const isValid = codeGen.isValid(value);
        e.target.style.borderColor = value.length > 0 ? (isValid ? '#27ae60' : '#e74c3c') : '';
      });
    }

    // Auto-focus and enter key handling
    const playerNameInput = $("#playerName") || $("#name");
    if (playerNameInput && !playerNameInput.value) {
      playerNameInput.focus();
    }

    // Enter key shortcuts
    document.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const currentView = viewManager.getCurrentView();
        if (currentView === "view-join") {
          const joinBtn = $("#joinRoomBtn") || $("#btnJoin");
          if (joinBtn && !joinBtn.disabled) joinBtn.click();
        }
      }
    });
  }

  handleCreateRoom() {
    const name = this.getInputValue("#playerName", "#name") || "Player";
    const roomName = this.getInputValue("#roomNameInput", "#roomName") || "";
    const seats = parseInt(this.getInputValue("#seatCount") || "4", 10);
    const startLives = parseInt(this.getInputValue("#startingLives") || "7", 10);

    // Validation
    if (seats < 2 || seats > 10) {
      toast.error("Seats must be between 2 and 10");
      return;
    }

    if (startLives < 1 || startLives > 20) {
      toast.error("Starting lives must be between 1 and 20");
      return;
    }

    gameState.setPlayer({ name, host: true });
    const code = codeGen.generate(6);
    gameState.setRoom({ code, name: roomName, seats, startLives });

    router.setHash(code);
    toast.show(lang.t('creating'));

    socketManager.emit("create_room", 
      { code, roomName, seats, startLives, name }, 
      (err, res) => {
        if (err) {
          console.warn("[SG] create_room timeout/error:", err);
          toast.error("Request timed out. " + lang.t('try_again'));
          return;
        }

        if (!res || res.ok !== true) {
          const errorMsg = res?.error || lang.t('create_fail');
          toast.error(errorMsg);
          location.hash = "";
          router.applyRouteFromHash();
          return;
        }

        // Update with server response
        const room = res.room || {};
        gameState.setRoom({
          seats: room.seats || seats,
          startLives: room.startLives || startLives
        });

        if ($("#roomCodeBadge")) {
          $("#roomCodeBadge").textContent = gameState.room.code;
        }

        toast.success(lang.t('created'));
      }
    );
  }

  handleJoinRoom() {
    const name = this.getInputValue("#playerName", "#name") || "Player";
    const code = (this.getInputValue("#roomCode") || "").toUpperCase();

    if (!codeGen.isValid(code)) {
      toast.error(lang.t('invalid_room_code'));
      return;
    }

    gameState.setPlayer({ name, host: false });
    gameState.setRoomCode(code);

    router.setHash(code);
    toast.show(lang.t('connecting'));

    socketManager.emit("join_room", 
      { code, name }, 
      (err, res) => {
        if (err) {
          console.warn("[SG] join_room timeout/error:", err);
          toast.error("Request timed out. " + lang.t('try_again'));
          return;
        }

        if (!res || res.ok !== true) {
          const errorMsg = res?.error || lang.t('join_fail');
          toast.error(errorMsg);
          location.hash = "";
          router.applyRouteFromHash();
        }
      }
    );
  }

  handleConfigureRoom() {
    if (!gameState.me.host) {
      toast.warning(lang.t('host_only'));
      return;
    }

    const seats = parseInt(this.getInputValue("#seatCount") || gameState.room.seats, 10);
    const startLives = parseInt(this.getInputValue("#startingLives") || gameState.room.startLives, 10);

    if (seats < 2 || seats > 10) {
      toast.error("Seats must be between 2 and 10");
      return;
    }

    if (startLives < 1 || startLives > 20) {
      toast.error("Starting lives must be between 1 and 20");
      return;
    }

    socketManager.emit("configure_room", { 
      code: gameState.room.code, 
      seats, 
      startLives 
    });

    gameState.setRoom({ seats, startLives });
    toast.success(lang.t('settings_applied'));
  }

  handleStartGame() {
    if (!gameState.me.host) {
      toast.warning(lang.t('host_only'));
      return;
    }

    if (gameState.players.length < 2) {
      toast.warning("Need at least 2 players to start");
      return;
    }

    socketManager.emit("start_now", { code: gameState.room.code });
    toast.show("Starting game…");
  }

  getInputValue(...selectors) {
    for (const selector of selectors) {
      const el = $(selector);
      if (el && el.value !== undefined) {
        return el.value.trim();
      }
    }
    return "";
  }
}

// Initialize UI controller
const uiController = new UIController();

/* --- Sistema de notificaciones mejorado --- */
class NotificationManager {
  constructor() {
    this.permission = 'default';
    this.init();
  }

  async init() {
    if ('Notification' in window) {
      this.permission = Notification.permission;
      
      if (this.permission === 'default') {
        try {
          this.permission = await Notification.requestPermission();
        } catch (e) {
          console.warn('[SG] Notification permission error:', e);
        }
      }
    }
  }

  show(title, options = {}) {
    if (this.permission !== 'granted' || !('Notification' in window)) {
      return;
    }

    // Don't show notifications if tab is active
    if (!document.hidden) {
      return;
    }

    const defaultOptions = {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'survival-game',
      requireInteraction: false,
      ...options
    };

    try {
      const notification = new Notification(title, defaultOptions);
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);
      
      return notification;
    } catch (e) {
      console.warn('[SG] Could not show notification:', e);
    }
  }

  showTurnNotification(playerName) {
    this.show(`Survival Game - ${playerName}'s Turn`, {
      body: `It's ${playerName}'s turn to play`,
      tag: 'turn-notification'
    });
  }

  showGameEvent(title, message) {
    this.show(`Survival Game - ${title}`, {
      body: message,
      tag: 'game-event'
    });
  }
}

const notifications = new NotificationManager();

/* --- Sistema de audio mejorado --- */
class AudioManager {
  constructor() {
    this.enabled = true;
    this.volume = 0.7;
    this.sounds = {};
    this.init();
  }

  init() {
    // Create audio elements for different sounds
    this.createSound('turn', this.generateToneURL(800, 200)); // Turn notification
    this.createSound('join', this.generateToneURL(600, 150)); // Player joined
    this.createSound('leave', this.generateToneURL(400, 150)); // Player left
    this.createSound('success', this.generateToneURL([600, 800], 300)); // Success action
    this.createSound('error', this.generateToneURL(300, 200)); // Error
    
    // Load settings
    this.loadSettings();
    this.setupControls();
  }

  createSound(name, url) {
    try {
      const audio = new Audio();
      audio.volume = this.volume;
      audio.preload = 'auto';
      if (url) {
        audio.src = url;
      }
      this.sounds[name] = audio;
    } catch (e) {
      console.warn(`[SG] Could not create sound ${name}:`, e);
    }
  }

  generateToneURL(frequency, duration) {
    try {
      const sampleRate = 44100;
      const samples = sampleRate * (duration / 1000);
      const buffer = new ArrayBuffer(samples * 2);
      const view = new DataView(buffer);
      
      const frequencies = Array.isArray(frequency) ? frequency : [frequency];
      
      for (let i = 0; i < samples; i++) {
        let sample = 0;
        frequencies.forEach(freq => {
          sample += Math.sin(2 * Math.PI * freq * i / sampleRate) / frequencies.length;
        });
        
        // Apply envelope (fade in/out)
        const fadeLength = samples * 0.1;
        if (i < fadeLength) {
          sample *= i / fadeLength;
        } else if (i > samples - fadeLength) {
          sample *= (samples - i) / fadeLength;
        }
        
        const value = Math.max(-32768, Math.min(32767, sample * 32767));
        view.setInt16(i * 2, value, true);
      }
      
      const blob = new Blob([buffer], { type: 'audio/wav' });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn('[SG] Could not generate tone:', e);
      return null;
    }
  }

  play(soundName) {
    if (!this.enabled || !this.sounds[soundName]) return;
    
    try {
      const sound = this.sounds[soundName];
      sound.currentTime = 0;
      sound.volume = this.volume;
      sound.play().catch(e => {
        // Ignore play errors (user hasn't interacted yet)
        console.debug(`[SG] Could not play sound ${soundName}:`, e.message);
      });
    } catch (e) {
      console.warn(`[SG] Sound playback error for ${soundName}:`, e);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.saveSettings();
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    Object.values(this.sounds).forEach(sound => {
      sound.volume = this.volume;
    });
    this.saveSettings();
  }

  loadSettings() {
    try {
      const settings = localStorage.getItem('sg_audio_settings');
      if (settings) {
        const parsed = JSON.parse(settings);
        this.enabled = parsed.enabled !== false;
        this.volume = parsed.volume || 0.7;
      }
    } catch (e) {
      console.warn('[SG] Could not load audio settings:', e);
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('sg_audio_settings', JSON.stringify({
        enabled: this.enabled,
        volume: this.volume
      }));
    } catch (e) {
      console.warn('[SG] Could not save audio settings:', e);
    }
  }

  setupControls() {
    // Setup audio controls if they exist in the UI
    const volumeSlider = $('#volumeSlider');
    const audioToggle = $('#audioToggle');
    
    if (volumeSlider) {
      volumeSlider.value = this.volume * 100;
      volumeSlider.addEventListener('input', (e) => {
        this.setVolume(e.target.value / 100);
      });
    }
    
    if (audioToggle) {
      audioToggle.checked = this.enabled;
      audioToggle.addEventListener('change', (e) => {
        this.setEnabled(e.target.checked);
      });
    }
  }
}

const audio = new AudioManager();

/* --- Sistema de análticas y métricas --- */
class AnalyticsManager {
  constructor() {
    this.sessionStart = Date.now();
    this.events = [];
    this.maxEvents = 100;
  }

  track(event, data = {}) {
    const eventData = {
      event,
      timestamp: Date.now(),
      sessionTime: Date.now() - this.sessionStart,
      view: viewManager.getCurrentView(),
      roomCode: gameState.room.code,
      isHost: gameState.me.host,
      ...data
    };

    this.events.push(eventData);
    
    // Keep only recent events
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    console.log('[SG Analytics]', eventData);
  }

  getMetrics() {
    return {
      sessionDuration: Date.now() - this.sessionStart,
      totalEvents: this.events.length,
      roomCode: gameState.room.code,
      playerName: gameState.me.name,
      isHost: gameState.me.host,
      connectionState: gameState.connectionState,
      currentView: viewManager.getCurrentView(),
      gamePhase: gameState.gamePhase
    };
  }

  exportData() {
    return {
      metrics: this.getMetrics(),
      events: this.events
    };
  }
}

const analytics = new AnalyticsManager();

/* --- Sistema de debug y desarrollo --- */
class DebugManager {
  constructor() {
    this.enabled = this.isDevelopment();
    this.commands = new Map();
    this.init();
  }

  isDevelopment() {
    return location.hostname === 'localhost' || 
           location.hostname === '127.0.0.1' || 
           location.search.includes('debug=true');
  }

  init() {
    if (!this.enabled) return;

    this.setupCommands();
    this.setupGlobalDebugging();
    this.setupKeyboardShortcuts();
  }

  setupCommands() {
    this.commands.set('state', () => {
      console.log('Game State:', gameState);
      return gameState;
    });

    this.commands.set('metrics', () => {
      const metrics = analytics.getMetrics();
      console.log('Analytics:', metrics);
      return metrics;
    });

    this.commands.set('socket', () => {
      console.log('Socket:', socketManager.socket);
      return socketManager.socket;
    });

    this.commands.set('toast', (message = 'Test toast', type = 'default') => {
      toast[type] ? toast[type](message) : toast.show(message);
    });

    this.commands.set('view', (viewId) => {
      if (viewId) {
        viewManager.goto(viewId);
      } else {
        console.log('Current view:', viewManager.getCurrentView());
        console.log('Available views:', VIEW_IDS);
      }
    });

    this.commands.set('lang', (newLang) => {
      if (newLang) {
        lang.setLanguage(newLang);
      } else {
        console.log('Current language:', lang.lang);
        console.log('Available languages:', Object.keys(I18N));
      }
    });

    this.commands.set('help', () => {
      console.log('Available debug commands:');
      for (const [cmd, func] of this.commands) {
        console.log(`  SG.${cmd}()`);
      }
    });
  }

  setupGlobalDebugging() {
    window.SG = {};
    for (const [name, func] of this.commands) {
      window.SG[name] = func;
    }

    // Global references for debugging
    window.SG.gameState = gameState;
    window.SG.socketManager = socketManager;
    window.SG.viewManager = viewManager;
    window.SG.analytics = analytics;
    window.SG.toast = toast;
    window.SG.audio = audio;
    
    console.log('[SG] Debug mode enabled. Type SG.help() for commands.');
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+D for debug panel
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        this.toggleDebugPanel();
      }
    });
  }

  toggleDebugPanel() {
    let panel = $('#debugPanel');
    
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'debugPanel';
      panel.innerHTML = `
        <div style="position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.9); color: white; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px; z-index: 10000; max-width: 300px; max-height: 80vh; overflow-y: auto;">
          <h3>Debug Panel</h3>
          <button onclick="this.parentNode.parentNode.remove()" style="float: right; margin-top: -30px;">×</button>
          <div id="debugContent"></div>
        </div>
      `;
      document.body.appendChild(panel);
    }

    const content = $('#debugContent');
    if (content) {
      const metrics = analytics.getMetrics();
      content.innerHTML = `
        <p><strong>View:</strong> ${viewManager.getCurrentView()}</p>
        <p><strong>Connection:</strong> ${gameState.connectionState}</p>
        <p><strong>Room:</strong> ${gameState.room.code}</p>
        <p><strong>Players:</strong> ${gameState.players.length}</p>
        <p><strong>Session:</strong> ${Math.round(metrics.sessionDuration / 1000)}s</p>
        <p><strong>Events:</strong> ${metrics.totalEvents}</p>
        <button onclick="SG.toast('Debug toast!', 'success')" style="margin: 5px;">Test Toast</button>
        <button onclick="SG.audio.play('turn')" style="margin: 5px;">Test Audio</button>
        <button onclick="console.log(SG.analytics.exportData())" style="margin: 5px;">Export Data</button>
      `;
    }
  }
}

const debug = new DebugManager();

/* --- Extensiones de los event listeners existentes --- */
// Extend socket manager with audio and notification support
const originalSetTurnOwner = socketManager.setTurnOwner;
socketManager.setTurnOwner = function(turnOwner) {
  originalSetTurnOwner.call(this, turnOwner);
  
  if (turnOwner) {
    const isMyTurn = turnOwner.id === this.socket.id || turnOwner.name === gameState.me.name;
    
    analytics.track('turn_changed', { 
      turnOwner: turnOwner.name, 
      isMyTurn 
    });

    if (isMyTurn) {
      audio.play('turn');
      notifications.showTurnNotification(turnOwner.name);
    } else {
      notifications.showTurnNotification(turnOwner.name);
    }
  }
};

// Extend socket event listeners with audio feedback
socketManager.socket.on("player_joined", (payload) => {
  if (payload?.player?.name) {
    toast.success(lang.t('player_joined', payload.player.name));
    audio.play('join');
    analytics.track('player_joined', { playerName: payload.player.name });
  }
});

socketManager.socket.on("player_left", (payload) => {
  if (payload?.player?.name) {
    toast.warning(lang.t('player_left', payload.player.name));
    audio.play('leave');
    analytics.track('player_left', { playerName: payload.player.name });
  }
});

// Enhanced error handling with better feedback
socketManager.socket.on("error", (payload) => {
  const message = payload?.message || payload?.error || lang.t('error_occurred');
  toast.error(message);
  audio.play('error');
  analytics.track('error', { message, payload });
});

/* --- Manejo de visibilidad de página --- */
document.addEventListener('visibilitychange', () => {
  analytics.track('visibility_change', { 
    hidden: document.hidden 
  });
  
  if (!document.hidden) {
    // Page became visible, check connection
    if (gameState.connectionState !== 'connected') {
      toast.show('Checking connection…');
    }
  }
});

/* --- Manejo de eventos de ventana --- */
window.addEventListener('beforeunload', (e) => {
  analytics.track('page_unload', {
    sessionDuration: Date.now() - analytics.sessionStart
  });
  
  // Only show warning if in an active game
  if (gameState.gamePhase === 'playing' && gameState.room.code) {
    e.preventDefault();
    e.returnValue = 'You are in the middle of a game. Are you sure you want to leave?';
    return e.returnValue;
  }
});

window.addEventListener('online', () => {
  toast.success('Back online');
  analytics.track('online');
});

window.addEventListener('offline', () => {
  toast.warning('Connection lost');
  analytics.track('offline');
});

/* --- Inicialización final y cleanup --- */
document.addEventListener('DOMContentLoaded', () => {
  analytics.track('dom_ready');
  
  // Initialize all systems
  router.applyRouteFromHash();
  lang.updateUITexts();
  
  // Clean up any stale toasts
  toast.killStaleToast();
  
  console.log('[SG] Client initialized successfully');
  analytics.track('client_initialized');
});

// Performance monitoring
if ('performance' in window && performance.mark) {
  performance.mark('sg-client-loaded');
}

/* --- Utilities para desarrolladores --- */
if (debug.enabled) {
  // Add helpful global utilities
  window.SG.utils = {
    simulateNetworkError: () => {
      socketManager.socket.disconnect();
      setTimeout(() => socketManager.socket.connect(), 3000);
    },
    
    fillTestData: () => {
      const nameInput = $('#playerName') || $('#name');
      const roomInput = $('#roomCode');
      if (nameInput) nameInput.value = 'TestPlayer' + Math.floor(Math.random() * 100);
      if (roomInput) roomInput.value = 'TEST01';
    },
    
    skipToView: (viewId) => {
      viewManager.goto(viewId);
      analytics.track('debug_skip_view', { viewId });
    }
  };
}
