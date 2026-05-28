"use client";

/**
 * localStorage-backed draft autosave. Each (room code, round, phase)
 * tuple gets its own slot. Storage is best-effort: any error (quota,
 * private-mode, disabled) is swallowed silently — drafts are a recovery
 * convenience, not a correctness guarantee. The cookie still authoritatively
 * records the player's identity + room; this only restores the *text*
 * they were typing if the tab dies before they submit.
 */

const KEY_PREFIX = "zeus.draft.v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // a day — matches the session cookie TTL

function key(code, round, phase) {
  return `${KEY_PREFIX}.${code}.${round}.${phase}`;
}

export function loadDraft({ code, round, phase }) {
  if (typeof window === "undefined") return null;
  if (!code || round == null || !phase) return null;
  try {
    const raw = window.localStorage.getItem(key(code, round, phase));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Treat anything older than MAX_AGE_MS as stale.
    if (Date.now() - (parsed?.savedAt ?? 0) > MAX_AGE_MS) {
      window.localStorage.removeItem(key(code, round, phase));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft({ code, round, phase, content, language }) {
  if (typeof window === "undefined") return;
  if (!code || round == null || !phase) return;
  try {
    window.localStorage.setItem(
      key(code, round, phase),
      JSON.stringify({
        content: content ?? "",
        language: language ?? null,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // quota / disabled — silently ignore
  }
}

export function clearDraft({ code, round, phase }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(code, round, phase));
  } catch {
    // ignore
  }
}
