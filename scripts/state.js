// Shared state + sync via BroadcastChannel + localStorage

const CHANNEL_NAME = 'wack-wof';
const STORAGE_KEY = 'wack-wof-state-v1';
const SESSIONS_KEY = 'wack-wof-sessions-v1';

// Safe deep clone for broader browser support
function deepClone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

function genId() { return Math.random().toString(36).slice(2, 9); }

// Pointer mapping: CSS conic 0deg is at 3 o'clock.
// Empirically, the top pointer aligns best with 0deg in this setup because of
// how the canvas rotation, label transforms, and pointer triangle are composed.
// Keeping this as a single constant lets us adjust easily if visuals change.
export const POINTER_TOP_DEG = 0;

export class State {
  constructor(options = {}) {
    this.sessionFilter = options.sessionId || null;
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.listeners = new Set();
    this.sse = null;
    // Initialize with a safe default immediately so UIs can render
    this._state = defaultState();
    if (this.sessionFilter) {
      this._state.settings.sessionId = this.sessionFilter;
    }
    this.channel.onmessage = (ev) => {
      if (!ev || !ev.data) return;
      if (ev.data.type === 'state_update') {
        const incoming = ev.data.payload;
        const incomingSession = incoming && incoming.settings ? incoming.settings.sessionId : null;
        if (this.sessionFilter && incomingSession && this.sessionFilter !== incomingSession) {
          return; // ignore updates for other sessions
        }
        this._state = incoming;
        this._persist();
        this._emit();
      }
    };
    // Kick off async load for session/server sync
    this._initState(options);
    // Apply body transparency if needed (board/admin both can respect)
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('transparent', !!this._state.settings.transparentBg);
    }
  }

  async _initState(options) {
    if (this.sessionFilter) {
      // Try server state first
      try {
        const resp = await fetch(`/api/state/${encodeURIComponent(this.sessionFilter)}`);
        if (resp.ok) {
          const st = await resp.json();
          if (st) { this._state = st; this._persist(); }
        }
      } catch {}
      if (!this._state) {
        const fromStore = loadSessionState(this.sessionFilter);
        if (fromStore) {
          this._state = fromStore;
        } else {
          const d = defaultState();
          d.settings.sessionId = this.sessionFilter;
          this._state = d;
        }
      }
      // Connect SSE for live updates
      try {
        this.sse = new EventSource(`/api/stream?sessionId=${encodeURIComponent(this.sessionFilter)}`);
        this.sse.onmessage = (e) => {
          try {
            const st = JSON.parse(e.data);
            if (st) {
              this._state = st;
              this._persist();
              this._emit();
            }
          } catch {}
        };
      } catch {}
      // Emit now that async init is done
      this._emit();
    } else {
      this._state = this._load() || this._state || defaultState();
      this._emit();
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  _emit() {
    for (const fn of this.listeners) fn(this._state);
  }
  _persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state)); } catch {}
    // Autosave to session store if sessionId is set
    try {
      const sid = this._state?.settings?.sessionId;
      if (sid) {
        const sessions = loadSessions();
        sessions[sid] = sessions[sid] || { id: sid, name: `Session ${sid}`, createdAt: Date.now(), state: null };
        sessions[sid].state = this._state;
        saveSessions(sessions);
      }
    } catch {}
  }
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  get() { return this._state; }
  set(updater) {
    const s = this._state;
    const next = typeof updater === 'function' ? updater(deepClone(s)) : updater;
    this._state = next;
    this._persist();
    this.channel.postMessage({ type: 'state_update', payload: next });
    this._emit();
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('transparent', !!this._state.settings.transparentBg);
    }
    // Push to server if we have a session id
    const sid = (this._state && this._state.settings && this._state.settings.sessionId) ? this._state.settings.sessionId : this.sessionFilter;
    if (sid) {
      try {
        fetch(`/api/state/${encodeURIComponent(sid)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this._state),
        });
      } catch {}
    }
  }

  setSessionFilter(sessionId) {
    this.sessionFilter = sessionId || null;
  }
}

export function defaultState() {
  const id = () => Math.random().toString(36).slice(2, 9);
  return {
    settings: {
      transparentBg: false,
      showWheel: false,
      showShop: false,
      delayResolvableActions: false,
      delayScoringPoints: false,
      angledView: false,
      angledPreset: 'standard',
      wheelZoom: 1,
      wheelPointerOffset: 0,
      wheelVerticalLabels: false,
      realisticWheel: false,
      realisticBoard: false,
      playersPanelWidth: 300,
      playersPanelScale: 1,
      playersScoreScale: 1,
      puzzleScale: 1,
      sessionId: null,
    },
    shop: {
      items: [], // [{ id, bonusId, price }]
      style: { rackTheme: 'shelf', keeperImageDataUrl: '', keeperOffsetX: 0, keeperOffsetY: 0 },
    },
    players: [
      { id: id(), name: 'Player 1', score: 0, inventory: [] },
      { id: id(), name: 'Player 2', score: 0, inventory: [] },
      { id: id(), name: 'Player 3', score: 0, inventory: [] },
    ],
    activePlayerId: null,
    puzzles: [
      { category: 'Phrase', phrase: 'HELLO WORLD' },
    ],
    currentPuzzleIndex: 0,
    revealedLetters: [],
    guessedLetters: [],
    bonusItems: [], // {id, name, imageDataUrl}
    wheel: {
      slots: [
        { label: '500', color: '#3a4b8f' },
        { label: '700', color: '#5a7cf0' },
        { label: 'Bankrupt', color: '#8f3a3a' },
        { label: '600', color: '#3a8f7b' },
        { label: '900', color: '#8f7a3a' },
        { label: 'Lose Turn', color: '#7a3a8f' },
        { label: '800', color: '#3a8f88' },
        { label: '650', color: '#4f5f92' },
      ],
    },
    wheelSpin: {
      angle: 0,
      spinning: false,
      resultIndex: null,
      resultLabel: null,
      finishedAt: null,
    },
    pendingActions: [], // [{id,type:'bankrupt'|'lose_turn'|'text'|'points', label?, amount?, playerId, createdAt}]
  };
}

export function currentPuzzleText(state) {
  const p = state.puzzles[state.currentPuzzleIndex];
  return ((p && p.phrase) ? p.phrase : '').toUpperCase();
}

export function isLetter(char) {
  return /^[A-Z]$/.test(char);
}

export function isVowel(char) {
  const L = (char || '').toUpperCase();
  return ['A', 'E', 'I', 'O', 'U'].includes(L);
}

export function revealLetter(state, letter) {
  const L = (letter || '').toUpperCase();
  if (!isLetter(L)) return state;
  const next = deepClone(state);
  if (!next.guessedLetters.includes(L)) next.guessedLetters.push(L);
  if (!next.revealedLetters.includes(L)) next.revealedLetters.push(L);
  next.ui = next.ui || {};
  next.ui.lastReveal = { letter: L, at: Date.now() };
  return next;
}

export function revealAll(state) {
  const next = deepClone(state);
  const text = currentPuzzleText(next);
  const uniq = new Set();
  for (const ch of text) { if (/^[A-Z]$/.test(ch)) uniq.add(ch); }
  const existingG = new Set(next.guessedLetters || []);
  const existingR = new Set(next.revealedLetters || []);
  for (const L of uniq) { existingG.add(L); existingR.add(L); }
  next.guessedLetters = Array.from(existingG);
  next.revealedLetters = Array.from(existingR);
  next.ui = next.ui || {};
  next.ui.lastReveal = { letter: "[ALL]", at: Date.now() };
  return next;
}
export function buyVowel(state, playerId, vowel, cost) {
  const L = (vowel || '').toUpperCase();
  const price = Math.max(0, parseInt(cost, 10) || 0);
  if (!isVowel(L)) return state;
  const next = deepClone(state);
  const player = next.players.find(p => p.id === playerId);
  if (!player) return state;
  if ((player.score || 0) < price) return state;
  // Deduct and reveal
  player.score = Math.max(0, (player.score || 0) - price);
  if (!next.guessedLetters.includes(L)) next.guessedLetters.push(L);
  if (!next.revealedLetters.includes(L)) next.revealedLetters.push(L);
  next.ui = next.ui || {};
  next.ui.lastReveal = { letter: L, at: Date.now() };
  return next;
}

export function setActivePlayer(state, playerId) {
  const next = deepClone(state);
  next.activePlayerId = playerId;
  return next;
}

export function toggleWheel(state, show) {
  const next = deepClone(state);
  next.settings.showWheel = !!show;
  if (show) next.settings.showShop = false; // wheel takes precedence
  return next;
}

export function toggleShop(state, show) {
  const next = deepClone(state);
  next.settings.showShop = !!show;
  if (show) next.settings.showWheel = false; // shop takes precedence
  return next;
}

// Shop management
export function addShopItem(state, bonusId, price) {
  const next = deepClone(state);
  next.shop = next.shop || { items: [], style: { rackTheme: 'shelf', keeperImageDataUrl: '' } };
  const id = genId();
  next.shop.items.push({ id, bonusId, price: Math.max(0, parseInt(price,10)||0) });
  return next;
}

export function updateShopItemPrice(state, itemId, price) {
  const next = deepClone(state);
  const it = (next.shop && next.shop.items || []).find(x => x.id === itemId);
  if (it) it.price = Math.max(0, parseInt(price,10)||0);
  return next;
}

export function removeShopItem(state, itemId) {
  const next = deepClone(state);
  if (next.shop && Array.isArray(next.shop.items)) {
    next.shop.items = next.shop.items.filter(x => x.id !== itemId);
  }
  return next;
}

export function setShopStyle(state, style) {
  const next = deepClone(state);
  next.shop = next.shop || { items: [], style: { rackTheme: 'shelf', keeperImageDataUrl: '', keeperOffsetX: 0, keeperOffsetY: 0 } };
  const merged = { ...next.shop.style, ...style };
  if (typeof merged.keeperOffsetX === 'number') merged.keeperOffsetX = Math.max(-1000, Math.min(1000, merged.keeperOffsetX));
  if (typeof merged.keeperOffsetY === 'number') merged.keeperOffsetY = Math.max(-1000, Math.min(1000, merged.keeperOffsetY));
  next.shop.style = merged;
  return next;
}

export function toggleTransparent(state, transparent) {
  const next = deepClone(state);
  next.settings.transparentBg = !!transparent;
  return next;
}

export function nextPuzzle(state) {
  const next = deepClone(state);
  next.currentPuzzleIndex = Math.min(
    next.puzzles.length - 1,
    next.currentPuzzleIndex + 1
  );
  next.revealedLetters = [];
  next.guessedLetters = [];
  return next;
}

export function addBonusItem(state, item) {
  const next = deepClone(state);
  next.bonusItems.push(item);
  return next;
}

export function awardBonusToPlayer(state, playerId, bonusId) {
  const next = deepClone(state);
  const p = next.players.find((x) => x.id === playerId);
  if (p) {
    p.inventory = Array.isArray(p.inventory) ? p.inventory : [];
    // Allow multiple copies of the same item
    p.inventory.push(bonusId);
  }
  return next;
}

export function removeBonusFromPlayer(state, playerId, bonusId) {
  const next = deepClone(state);
  const p = next.players.find((x) => x.id === playerId);
  if (p) {
    p.inventory = Array.isArray(p.inventory) ? p.inventory : [];
    // Remove only one copy of the specified item
    const idx = p.inventory.indexOf(bonusId);
    if (idx !== -1) p.inventory.splice(idx, 1);
  }
  return next;
}

export function setPlayers(state, players) {
  const next = deepClone(state);
  next.players = players;
  if (!players.some((p)=>p.id===next.activePlayerId)) next.activePlayerId = players[0]?.id || null;
  return next;
}

export function setPuzzles(state, puzzles) {
  const next = deepClone(state);
  next.puzzles = puzzles;
  next.currentPuzzleIndex = 0;
  next.revealedLetters = [];
  next.guessedLetters = [];
  return next;
}

export function setWheel(state, wheel) {
  const next = deepClone(state);
  next.wheel = wheel;
  return next;
}

export function randomizeBonusOnWheel(state) {
  const next = deepClone(state);
  const numbers = next.wheel.slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => /^\d+$/.test(s.label));
  const slotsIdx = numbers.map((x) => x.i);
  const shuffled = [...slotsIdx].sort(() => Math.random() - 0.5);
  next.wheel.slots.forEach((s) => { delete s.bonusItemId; });
  next.bonusItems.forEach((bi, idx) => {
    if (idx < shuffled.length) {
      next.wheel.slots[shuffled[idx]].bonusItemId = bi.id;
    }
  });
  return next;
}

export function addPuzzle(state, puzzle, makeCurrent = true) {
  const next = deepClone(state);
  next.puzzles = Array.isArray(next.puzzles) ? next.puzzles : [];
  next.puzzles.push({
    category: ((puzzle && puzzle.category) || '').trim(),
    phrase: ((puzzle && puzzle.phrase) || '').toUpperCase(),
  });
  if (makeCurrent) {
    next.currentPuzzleIndex = Math.max(0, next.puzzles.length - 1);
    next.revealedLetters = [];
    next.guessedLetters = [];
  }
  return next;
}

export function setCurrentPuzzle(state, index) {
  const next = deepClone(state);
  const max = Math.max(0, (next.puzzles?.length || 1) - 1);
  const clamped = Math.max(0, Math.min(max, parseInt(index, 10) || 0));
  next.currentPuzzleIndex = clamped;
  next.revealedLetters = [];
  next.guessedLetters = [];
  return next;
}

// Session storage utilities (local-only persistence)
function loadSessions() {
  try { const raw = localStorage.getItem(SESSIONS_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function saveSessions(map) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(map)); } catch {}
}

export function listSessions() {
  const map = loadSessions();
  return Object.values(map).sort((a,b)=> (a.createdAt||0)-(b.createdAt||0));
}

export function getSession(id) {
  const map = loadSessions();
  return map[id] || null;
}

export function deleteSession(id) {
  const map = loadSessions();
  if (map[id]) { delete map[id]; saveSessions(map); }
}

export function createSession(name, baseState) {
  const id = genId();
  const st = deepClone(baseState || defaultState());
  st.settings.sessionId = id;
  const map = loadSessions();
  map[id] = { id, name: name || `Session ${id}`, createdAt: Date.now(), state: st };
  saveSessions(map);
  return id;
}

export function loadSessionState(id) {
  const entry = getSession(id);
  return deepClone(entry && entry.state ? entry.state : null);
}

export function activePlayerIndex(state) {
  return Math.max(0, state.players.findIndex((p) => p.id === state.activePlayerId));
}

export function advancePlayer(state, step = 1) {
  const next = deepClone(state);
  if (!next.players.length) { next.activePlayerId = null; return next; }
  const idx = activePlayerIndex(next);
  const nidx = ((idx + step) % next.players.length + next.players.length) % next.players.length;
  next.activePlayerId = next.players[nidx].id;
  return next;
}

export function startSpin(state, desiredIndex = null) {
  const next = deepClone(state);
  const slots = next.wheel.slots || [];
  const N = Math.max(1, slots.length);
  const resultIndex = desiredIndex != null ? (desiredIndex % N) : Math.floor(Math.random() * N);
  const midDeg = ((resultIndex + 0.5) / N) * 360; // 0deg = 3 o'clock
  const pointerDeg = POINTER_TOP_DEG; // pointer at 12 o'clock
  const baseTarget = pointerDeg - midDeg; // rotation that aligns result to pointer
  const current = (next.wheelSpin && next.wheelSpin.angle) || 0;
  const minTurns = 4; // full rotations
  const extraTurns = 0 | (Math.random() * 3); // 0..2
  let target = baseTarget;
  // Ensure target is sufficiently ahead of current (minTurns)
  const needed = current + (minTurns + extraTurns) * 360;
  while (target <= needed) target += 360;

  next.wheelSpin = {
    angle: target,
    spinning: true,
    resultIndex,
    resultLabel: slots[resultIndex]?.label ?? '',
    resultOverride: null,
    finishedAt: null,
  };
  // Auto-show wheel view during spin
  next.settings.showWheel = true;
  next.settings.showShop = false;
  return next;
}

export function finishSpin(state) {
  const next = deepClone(state);
  if (!(next.wheelSpin && next.wheelSpin.spinning)) return next;
  next.wheelSpin.spinning = false;
  next.wheelSpin.finishedAt = Date.now();
  const idx = next.wheelSpin.resultIndex;
  const slot = next.wheel.slots[idx] || {};
  const label = (slot.label || '').toLowerCase();
  const delayed = !!(next.settings && next.settings.delayResolvableActions);
  if (label.includes('bankrupt')) {
    if (delayed) {
      next.pendingActions.push({ id: genId(), type: 'bankrupt', label: slot.label, playerId: next.activePlayerId, createdAt: Date.now() });
      return next;
    }
    const ap = next.players.find((p)=> p.id === next.activePlayerId);
    if (ap) ap.score = 0;
    return advancePlayer(next, 1);
  }
  if (label.includes('lose') && label.includes('turn')) {
    if (delayed) {
      next.pendingActions.push({ id: genId(), type: 'lose_turn', label: slot.label, playerId: next.activePlayerId, createdAt: Date.now() });
      return next;
    }
    return advancePlayer(next, 1);
  }
  // Any other non-numeric (text) slot — enqueue informational action if delayed
  if (!/^\d+$/.test(slot.label || '')) {
    if (delayed) next.pendingActions.push({ id: genId(), type: 'text', label: slot.label, playerId: next.activePlayerId, createdAt: Date.now() });
  }
  return next;
}

export function addPendingAction(state, action) {
  const next = deepClone(state);
  next.pendingActions = Array.isArray(next.pendingActions) ? next.pendingActions : [];
  next.pendingActions.push({ id: genId(), createdAt: Date.now(), ...action });
  return next;
}

export function resolvePendingAction(state, actionId) {
  const next = deepClone(state);
  const list = Array.isArray(next.pendingActions) ? next.pendingActions : [];
  const idx = list.findIndex(a => a.id === actionId);
  if (idx === -1) return next;
  const act = list[idx] || {};
  // Apply effects by type
  if (act.type === 'bankrupt') {
    const p = next.players.find(x => x.id === (act.playerId || next.activePlayerId));
    if (p) p.score = 0;
    return advancePlayer({ ...next, pendingActions: list.filter((_,i)=>i!==idx) }, 1);
  }
  if (act.type === 'lose_turn') {
    return advancePlayer({ ...next, pendingActions: list.filter((_,i)=>i!==idx) }, 1);
  }
  if (act.type === 'points') {
    const p = next.players.find(x => x.id === (act.playerId || next.activePlayerId));
    const amt = parseInt(act.amount, 10) || 0;
    if (p && amt) p.score = (p.score || 0) + amt;
    next.pendingActions = list.filter((_,i)=>i!==idx);
    return next;
  }
  // 'text' or unknown: just clear
  next.pendingActions = list.filter((_,i)=>i!==idx);
  return next;
}


export function setResultOverride(state, value) {
  const next = deepClone(state);
  next.wheelSpin = next.wheelSpin || {};
  const v = parseInt(value, 10);
  next.wheelSpin.resultOverride = Number.isFinite(v) ? v : null;
  return next;
}

