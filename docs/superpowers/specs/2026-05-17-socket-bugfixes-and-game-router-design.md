# Socket Bugfixes + GameRouter — Design

**Date:** 2026-05-17
**Status:** Approved, ready for implementation
**Scope:** Frontend `lib/socket/*` bugfixes + a new top-level `<GameRouter>` component that auto-navigates between game phases. No backend changes.

**Related:** Closes gaps introduced when subsystems #1 (lobby networking) and #2 (round networking) were filled in beyond the stub state. The original specs deferred "where does navigation happen?" as an open question; this spec answers it.

## Goal

Make the game actually progress through phases end-to-end:

1. Host clicks **Start Game** in `/waiting-room` → all players land on `/editor` (or `/describe` / `/reimplement` depending on `roundType` / `roundNum`).
2. Backend ticks through rounds → each player's page swaps as `round:begin` arrives.
3. Game ends → all players land on `/reveal`.
4. Host clicks **Play again** → all players land back on `/waiting-room`.

Plus: fix four concrete bugs in the socket library that surface once the game moves past the lobby.

## Scope

**In:**

- New component `frontend/src/components/socket/GameRouter.jsx` — single source of truth for in-game route transitions.
- Mount `<GameRouter />` in `frontend/src/app/layout.jsx`.
- Bugfixes in `frontend/src/lib/socket/{client,lobby,round,useLobby,useRound}.js` (details below).
- Doc fixes: `docs/API.md` field names, the round-networking spec's field names + JSDoc note.

**Out (deferred):**

- Reconnect / `game:sync` recovery flow (still an open subsystem).
- Deep-link `/r/ROOM-XXXX` route — GameRouter is designed to coexist with it but the route isn't built.
- Ready-state per player — backend has no protocol field for it yet.
- Backend changes — all fixes are frontend-only.

## Architecture: `<GameRouter>`

A `"use client"` component mounted once in `app/layout.jsx`. It consumes `useLobby()` + `useRound()` and pushes routes via `useRouter()` from `next/navigation`.

### State → route table

| Lobby `roomCode` | Round `status`     | `roundType` | `roundNum` | Target          |
|------------------|--------------------|-------------|------------|-----------------|
| null             | any                | —           | —          | `/` (no push)   |
| set              | `idle` / `lobby`   | —           | —          | `/waiting-room` |
| set              | `active`           | `code`      | 1          | `/editor`       |
| set              | `active`           | `describe`  | any        | `/describe`     |
| set              | `active`           | `code`      | >1         | `/reimplement`  |
| set              | `reveal` / `over`  | —           | —          | `/reveal`       |

### Guard rails

- **If `pathname === "/"`, do not auto-push.** The home wizard owns the first push (`router.push("/waiting-room")` after `createRoom` / `joinRoom`). After that the wizard is "off the desktop" and GameRouter takes over.
- **If `pathname === target`, no-op.** Don't push to a route you're already on — avoids redundant navigations and pathname flicker.

### Why centralize navigation

Per-page `useEffect` would scatter the routing rule across five files; a hook-internal `router.push()` couples the hook to `next/navigation` and breaks unit-testability. A single component reading both hooks is one source of truth.

### Sketch

```jsx
// frontend/src/components/socket/GameRouter.jsx
"use client";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLobby } from "@/lib/socket/useLobby";
import { useRound } from "@/lib/socket/useRound";

export default function GameRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const { roomCode } = useLobby();
  const { status, roundType, roundNum } = useRound();

  const target = useMemo(() => {
    if (!roomCode) return "/";
    if (status === "reveal" || status === "over") return "/reveal";
    if (status === "active") {
      if (roundType === "describe") return "/describe";
      if (roundType === "code") return roundNum === 1 ? "/editor" : "/reimplement";
    }
    return "/waiting-room";
  }, [roomCode, status, roundType, roundNum]);

  useEffect(() => {
    if (pathname === "/") return;
    if (pathname === target) return;
    router.push(target);
  }, [pathname, target, router]);

  return null;
}
```

## Per-file bugfixes

### `lib/socket/client.js`

**Bug:** if `disconnect()` is called mid-connect, the connecting promise never settles — pending `await connect(...)` calls hang forever.

**Fix:** keep a reference to the `reject` function for the connecting promise; have `disconnect()` call it before clearing module state.

### `lib/socket/lobby.js`

**Bug 1 — handler accumulation on Fast Refresh.** Module-level `on("room:created"/...)` calls re-run when the module re-evaluates, stacking duplicate handlers in `client.js`'s `handlers` Map.

**Fix:** store `lobbyState`, the `subscribers` Set, and an `__attached` flag on `globalThis` (keyed by a unique string). On module load:

```js
const STORE_KEY = "__zeus_lobby_store_v1";
if (!globalThis[STORE_KEY]) {
  globalThis[STORE_KEY] = {
    state: { code: null, roomId: null, playerId: null, hostId: null,
             roundCount: null, players: [], gameStarted: false },
    subscribers: new Set(),
    attached: false,
  };
}
const store = globalThis[STORE_KEY];

if (!store.attached) {
  store.attached = true;
  on("room:created", /* updates store.state */);
  on("room:joined",  /* ... */);
  on("room:updated", /* ... */);
  on("game:started", /* ... */);
}
```

Closures fired by the persisted handlers still write to the persisted `store.state`; new `useLobby` mounts (post-refresh) subscribe to the persisted `store.subscribers` set. State stays consistent across hot reloads. In production, Fast Refresh never runs, so the global is set once and stays put.

**Bug 2 — `room:updated` clobbers `players` when payload omits it.** Current code does `players: data?.players ?? []`, which zeros the list. Backend always sends `players`, but defensive code should preserve.

**Fix:** `players: data?.players ?? store.state.players`.

**Bug 3 — `useLobby` has no signal that the game started.** Non-host players need to react to `game:started`; today only the host's `awaitOne` in `startGame()` sees it.

**Fix:** add `on("game:started", () => setLobby({ gameStarted: true }))`. Expose `gameStarted` on the `useLobby()` return shape (the GameRouter actually keys off `useRound.status === "active"`, but this signal is cheap to expose and useful for future consumers, e.g. a "starting…" splash).

**New export:** `ensureConnected` (already exists privately as a function — promote it to an export so `round.js` can use it).

### `lib/socket/round.js`

**Bug 1 — actions skip connection check.** `submitRound`, `syncGame`, `resetGame` all call `send(...)` directly. If the socket is closed, `send()` no-ops and the awaited reply never arrives.

**Fix:** `await ensureConnected()` at the top of all three actions.

**Bug 2 — `submitRound` predicate is permissive when `playerId` is null.** Today:

```js
(data) => !session.playerId || data?.playerId === session.playerId
```

If `playerId` is null (not in a room), this accepts any player's submission and resolves with their event. Wrong.

**Fix:** explicit guard at the top:

```js
const session = getSession();
if (!session.playerId) throw new Error("not in a room");
const reply = awaitOne(
  "round:player_submitted",
  "room:error",
  (data) => data?.playerId === session.playerId,
);
```

### `lib/socket/useLobby.js`

No structural change needed — once `lobby.js` tracks `gameStarted` on the persistent store, the existing `subscribeLobby` channel notifies useLobby automatically. Add `gameStarted` to the destructured shape returned by the hook.

### `lib/socket/useRound.js`

**Bug 1 — no reset signal after `game:reset`.** After the host calls reset, server broadcasts `room:updated`; `useRound.status` stays `"over"` for non-host players, so GameRouter never leaves `/reveal`.

**Fix:** add a `room:updated` listener that transitions `over` / `reveal` → `idle`:

```js
const offRoomUpdated = on("room:updated", () => {
  setState((prev) =>
    prev.status === "over" || prev.status === "reveal"
      ? { ...INITIAL }
      : prev,
  );
});
```

**Bug 2 — `submit` / `reset` aren't memoised.** Every render produces fresh function refs, causing any downstream `useEffect([submit])` to re-run unnecessarily.

**Fix:** wrap both in `useCallback([])`. They close over `setState` (stable) and the imperative actions from `round.js` (module-level, stable).

**Optional polish (in scope):** gate the 250 ms countdown interval on `deadlineRef.current != null` to avoid continuous re-renders when no round is active.

### `app/layout.jsx`

Add a single `<GameRouter />` child. The layout itself remains a server component; the `"use client"` boundary lives in `GameRouter.jsx`.

```jsx
import GameRouter from "@/components/socket/GameRouter";
// ...
<body>
  <GameRouter />
  <div className="desktop-root">
    <div className="window-area">{children}</div>
    <Superbar />
  </div>
</body>
```

## Doc updates

### `docs/API.md`

- **`round:begin` row** → mention the actual emitted field is `timeLimit` (seconds), alongside `roundNum`, `roundType`, `seed`. Replace "timing hints" with the explicit name.
- **`round:player_submitted` row** → clarify payload as `{playerId, totalSubmitted, totalPlayers}`. (Previously said "submittedCount" indirectly.)

### `docs/superpowers/specs/2026-05-16-round-networking-stubs.md`

- **Server → client protocol table:** `timeLimit` (not `secondsLeft`), `totalSubmitted` (not `submittedCount`). The spec was written before the backend was finalised; the implementation matches the backend, but the spec lagged.
- **`useRound()` JSDoc commentary:** add a note that `secondsLeft` is *derived* client-side from `timeLimit` + a `setInterval`, not read from the wire.

## Acceptance

- `npm run dev` boots; all five game routes (`/`, `/waiting-room`, `/editor`, `/describe`, `/reimplement`, `/reveal`) still return HTTP 200.
- With three browser tabs simulating three players: clicking **Start Game** in the waiting room navigates all three to `/editor`. Submitting in each tab progresses through `/describe` and `/reimplement`. After round count is reached, all tabs land on `/reveal`. Clicking **Play again** on the host's tab returns all three to `/waiting-room`.
- Disconnecting the socket mid-game and calling `submitRound` rejects cleanly with a recognisable error (no hang).
- Calling `submitRound` outside a room throws "not in a room" synchronously.
- Fast-refreshing `lobby.js` during a session does not stack duplicate handler invocations (verified by `console.log` count in the handler bodies, or by inspecting `handlers.get("room:updated").length`).
- `docs/API.md` and the round-networking spec name the actual wire fields (`timeLimit`, `totalSubmitted`).

## Open items (explicitly out of scope)

- **Reconnect.** If the socket drops, `useRound`/`useLobby` state is local React state — a refresh wipes it. Recovery via `game:sync` is its own subsystem.
- **Ready state per player.** Backend has no field; `useLobby.players[].ready` will stay hardcoded `false` until the protocol adds it.
- **Deep-link `/r/CODE`.** GameRouter doesn't break it; just doesn't help either.
