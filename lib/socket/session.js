// frontend/src/lib/socket/session.js
//
// Browser-storage persistence for the Code Telephone client.
//
// - Session bundle (sessionStorage): roomId + playerId + cached lobby snapshot.
//   Per-tab so two tabs in the same browser can't fight over the same playerId.
//   See docs/superpowers/specs/2026-05-19-input-persistence-design.md.
// - Draft (sessionStorage): the in-progress editor/description text for the
//   current (roomId, roundNum). loadDraft enforces the key match so stale
//   drafts from a previous round never leak in.
// - Nickname (localStorage): just a string the user wants remembered across
//   visits.
//
// All access is guarded so SSR (no window) and storage-disabled browsers
// (Safari private mode, locked-down embeds) degrade to no-op rather than
// crashing.

const SESSION_KEY = "zeus.session.v1";
const DRAFT_KEY = "zeus.draft.v1";
const NICKNAME_KEY = "zeus.nickname.v1";

function sessionStore() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function localStore() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson(store, key) {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(store, key, value) {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled — no-op */
  }
}

function remove(store, key) {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* no-op */
  }
}

// ── Session bundle ─────────────────────────────────────────────────

/**
 * @returns {{
 *   roomId: string | null,
 *   code: string | null,
 *   playerId: string | null,
 *   hostId: string | null,
 *   roundCount: number | null,
 *   players: object[],
 * } | null}
 */
export function loadSession() {
  return readJson(sessionStore(), SESSION_KEY);
}

export function saveSession(snap) {
  if (!snap || !snap.roomId || !snap.playerId) return;
  writeJson(sessionStore(), SESSION_KEY, {
    roomId: snap.roomId ?? null,
    code: snap.code ?? null,
    playerId: snap.playerId ?? null,
    hostId: snap.hostId ?? null,
    roundCount: snap.roundCount ?? null,
    players: Array.isArray(snap.players) ? snap.players : [],
  });
}

export function clearSession() {
  remove(sessionStore(), SESSION_KEY);
}

// ── Active draft ───────────────────────────────────────────────────

/**
 * Returns the saved draft content only when (roomId, roundNum) match
 * the caller. Mismatched drafts return null so a stale entry never
 * leaks into a new round.
 *
 * @param {string} roomId
 * @param {number} roundNum
 * @returns {string | null}
 */
export function loadDraft(roomId, roundNum) {
  if (!roomId || !roundNum) return null;
  const stored = readJson(sessionStore(), DRAFT_KEY);
  if (!stored) return null;
  if (stored.roomId !== roomId || stored.roundNum !== roundNum) return null;
  return typeof stored.content === "string" ? stored.content : null;
}

export function saveDraft(roomId, roundNum, content) {
  if (!roomId || !roundNum) return;
  writeJson(sessionStore(), DRAFT_KEY, {
    roomId,
    roundNum,
    content: typeof content === "string" ? content : "",
  });
}

export function clearDraft() {
  remove(sessionStore(), DRAFT_KEY);
}

// ── Nickname ───────────────────────────────────────────────────────

/** @returns {string | null} */
export function loadNickname() {
  const store = localStore();
  if (!store) return null;
  try {
    return store.getItem(NICKNAME_KEY);
  } catch {
    return null;
  }
}

export function saveNickname(name) {
  const store = localStore();
  if (!store) return;
  try {
    if (typeof name === "string" && name.length > 0) {
      store.setItem(NICKNAME_KEY, name);
    } else {
      store.removeItem(NICKNAME_KEY);
    }
  } catch {
    /* no-op */
  }
}
