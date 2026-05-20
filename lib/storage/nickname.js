// lib/storage/nickname.js
//
// Persist the player's last-used nickname in localStorage so the home
// wizard can pre-fill it on next visit. Pure client-side; no backend.
//
// The key matches the one previously used by lib/socket/session.js so
// existing users keep their saved nickname across this refactor.

const NICKNAME_KEY = "zeus.nickname.v1";

function localStore() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

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
