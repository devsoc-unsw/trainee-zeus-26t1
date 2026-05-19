# Input + Session Persistence on Refresh — Design

**Date:** 2026-05-19
**Status:** Approved, ready for implementation
**Scope:** Persist the player's session (room/player IDs, lobby snapshot) and any in-progress phase draft to browser storage so refreshing the page reconnects the user to their game with their unsaved text intact. Also persists the nickname across visits.

## Goal

Today a page refresh tears down the WebSocket connection and clears the in-memory `lobby` and `useRound` stores. `roomId` / `playerId` only exist in module-level globals, so even though the backend supports `game:sync`, the frontend has nothing to sync with — the user lands back on `/` and any draft they were writing is lost.

After this work:
- A refresh on any in-game route reconnects to the same room and player via `game:sync`, and `GameRouter` navigates back to the correct phase page.
- The text the user was typing (editor code or description) is restored.
- The nickname pre-fills on the home wizard for return visits.

## Storage choice

- **`sessionStorage`** for the session bundle and the active draft. Tied to the tab — survives refresh, dies on tab close. Avoids cross-tab "two tabs claim the same playerId" surprises since each tab gets its own copy.
- **`localStorage`** for the nickname only. It's just a string the user wants remembered across visits, with no multi-tab hazard.

All access goes through a thin wrapper with try/catch so private-browsing failures degrade to no-op rather than crashing.

## File-level changes

### New: `frontend/src/lib/socket/session.js`

A small persistence module. All reads return `null` on missing key, parse failure, or storage exception; all writes swallow exceptions.

```js
// Session bundle — sessionStorage, key "zeus.session.v1"
loadSession()  -> { roomId, code, playerId, hostId, roundCount, players } | null
saveSession(snap)
clearSession()

// Active draft — sessionStorage, key "zeus.draft.v1"
// Stored shape: { roomId, roundNum, content }. loadDraft returns the content
// only when (roomId, roundNum) match the caller; otherwise null.
loadDraft(roomId, roundNum) -> string | null
saveDraft(roomId, roundNum, content)
clearDraft()

// Nickname — localStorage, key "zeus.nickname.v1"
loadNickname() -> string | null
saveNickname(name)
```

Keys are versioned (`.v1`) so a future schema change can bump the suffix and stale entries are ignored on read.

### Modify: `frontend/src/lib/socket/lobby.js`

- At module init (after the existing `globalThis` store hydration), pre-fill `store.state` from `loadSession()` if present. This makes `getSession()` correct on first paint, before any WebSocket message has arrived.
- In `setLobby()`, mirror the merged state to `saveSession()`.
- In `leaveRoom()`, call `clearSession()` and `clearDraft()` in addition to the existing `setLobby(INITIAL_STATE)`.

The handler that runs on `room:created` / `room:joined` / `room:updated` / `game:started` already flows through `setLobby`, so persistence rides along automatically.

### Modify: `frontend/src/components/socket/GameRouter.jsx`

Add a one-shot reconnect effect that runs on first mount:

```js
useEffect(() => {
  const { roomId, playerId } = getSession();
  if (!roomId || !playerId) return;
  syncGame(roomId, playerId).catch(() => {
    clearSession();
    clearDraft();
    // The existing room:error handler in useRound surfaces a toast.
  });
}, []);
```

After sync settles, the existing routing effect (`pathname !== target` → `router.push(target)`) lands the user on the right phase.

### Modify: `frontend/src/app/editor/page.jsx`, `frontend/src/app/describe/page.jsx`, `frontend/src/app/reimplement/page.jsx`

Each phase page:

1. After `useRound()` / `useLobby()`, read `loadDraft(roomId, roundNum)` once `roomId` and `roundNum` are both defined. If non-null, seed the local state (`editorValue` / `description` / `reconstructedCode`) from it.
2. On every change to that state, call `saveDraft(roomId, roundNum, content)`.
3. After a successful `submit()`, call `clearDraft()`.

The existing "reset state when seed changes" guards in `/describe` and `/reimplement` handle round rollover — combined with the `(roomId, roundNum)` keying in storage, a stale draft never bleeds into a later round.

### Modify: `frontend/src/app/page.jsx`

- Initialize `nickname` state from `loadNickname() ?? ""`.
- In the `TextField` `onChange`, call `saveNickname(value)` alongside the existing `setNickname(value)`.

No other wizard fields persist — the join code and method selection are quick to re-enter and not worth the storage surface.

## Failure modes

- **`game:sync` rejects (room expired, server restarted, invalid playerId):** the catch block clears the persisted session and draft. The existing `room:error` handler in `useRound` already maps this to the `ErrorToast`. `GameRouter` then routes the now-empty `roomCode` state to `/`.
- **`sessionStorage` / `localStorage` unavailable** (Safari private mode, locked-down embedded browsers): every helper in `session.js` wraps access in try/catch and returns `null` / no-ops. The app behaves as it does today — no persistence, no crashes.
- **Draft from a stale round still in storage:** `loadDraft(roomId, roundNum)` requires both fields to match the caller's current `(roomId, roundNum)`. Mismatched drafts return `null`, and the next `saveDraft` overwrites them.
- **Two tabs in the same browser:** `sessionStorage` is per-tab, so each tab has its own session. (Pre-existing concern that two tabs can claim the same playerId via manual join is unchanged by this work.)

## Acceptance

- Open the app, enter a nickname, create a room, start a 3-player game, type partial code into `/editor`, refresh. The page lands back on `/editor` with the same room, the same player identity (host badge preserved), the same round, and the typed code restored.
- Same flow on `/describe` and `/reimplement` — refresh restores the in-progress description / reconstructed code.
- After submitting a round, refreshing on the next phase page does not restore the previous round's draft.
- Closing the tab and re-opening lands on `/` with a fresh session, but the nickname field is pre-filled.
- With `sessionStorage` disabled (DevTools → Application → clear), the app still works end-to-end — refresh just drops you back to `/`.
- `game:sync` failing (e.g. delete the in-memory room on the backend and refresh) clears the persisted state, shows an error toast, and lands the user on `/`.

## Out of scope

- Persisting wizard step/method/join-code beyond the nickname.
- Cross-device session restore (would require server-side session tokens — different problem).
- Auto-save of long-running drafts to the backend (drafts stay client-side).
- Surfacing "your previous session expired" as a dedicated modal — the existing toast is enough.
- Encrypting or otherwise hardening the storage payload — it contains a `playerId` (UUID) but no credentials.
