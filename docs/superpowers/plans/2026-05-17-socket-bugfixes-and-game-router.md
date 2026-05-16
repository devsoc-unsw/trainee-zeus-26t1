# Socket Bugfixes + GameRouter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level `<GameRouter>` that auto-navigates between game phases, and fix five concrete bugs in `frontend/src/lib/socket/*` that block real end-to-end play.

**Architecture:** New client component reads `useLobby()` + `useRound()` and pushes routes when the state→route mapping changes. Lobby module-level state moves onto `globalThis` to survive Next.js Fast Refresh without duplicating WebSocket handlers. Round-phase imperative actions all gate on `ensureConnected()`. `useRound` gains a `room:updated` listener so the post-reset transition out of `/reveal` actually fires for non-host players.

**Tech Stack:** Next.js 16 App Router, plain JavaScript (`.jsx`/`.js`), React 19, native WebSocket. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-17-socket-bugfixes-and-game-router-design.md`

**Commit policy:** Do not auto-commit. Leave changes unstaged so the user can review and commit themselves.

---

## File Map

- **Modify:** `frontend/src/lib/socket/client.js` — track pending connect's reject; have `disconnect()` settle it.
- **Modify:** `frontend/src/lib/socket/lobby.js` — globalThis-backed store; dedupe handler attachment; preserve players on `room:updated`; listen for `game:started`; export `ensureConnected`.
- **Modify:** `frontend/src/lib/socket/round.js` — `ensureConnected()` in all three actions; reject `submitRound` when no `playerId`.
- **Modify:** `frontend/src/lib/socket/useLobby.js` — expose `gameStarted` on the returned shape.
- **Modify:** `frontend/src/lib/socket/useRound.js` — `room:updated` listener resets `over`/`reveal` → `idle`; memoise `submit` + `reset`; gate countdown interval on active deadline.
- **Create:** `frontend/src/components/socket/GameRouter.jsx` — reads both hooks, computes target, pushes route.
- **Modify:** `frontend/src/app/layout.jsx` — mount `<GameRouter />`.
- **Modify:** `docs/API.md` — `round:begin` row says `timeLimit`; `round:player_submitted` row says `totalSubmitted`.
- **Modify:** `docs/superpowers/specs/2026-05-16-round-networking-stubs.md` — field name fixes + `useRound` JSDoc note.

---

## Task 1: Track + settle pending connect in `client.js`

**Files:**
- Modify: `frontend/src/lib/socket/client.js`

- [ ] **Step 1: Add a module-level handle for the pending reject**

At the top of `client.js`, alongside the existing module-level state:

```js
let socket = null;
let currentStatus = "idle";
let connectingPromise = null;
let connectingReject = null;   // NEW
const handlers = new Map();
```

- [ ] **Step 2: Capture `reject` when building `connectingPromise`**

Inside `connect()`, in the `new Promise((resolve, reject) => { ... })` body, store `reject` so `disconnect()` can call it. Replace the existing promise-construction block:

```js
  connectingPromise = new Promise((resolve, reject) => {
    const onOpen = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onErrorEarly);
      currentStatus = "open";
      resolve();
    };
    const onErrorEarly = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onErrorEarly);
      currentStatus = "closed";
      if (socket === ws) socket = null;
      connectingPromise = null;
      reject(new Error(`WebSocket connection to ${url} failed`));
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onErrorEarly);
  });
```

With:

```js
  connectingPromise = new Promise((resolve, reject) => {
    connectingReject = reject;
    const onOpen = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onErrorEarly);
      currentStatus = "open";
      connectingReject = null;
      resolve();
    };
    const onErrorEarly = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onErrorEarly);
      currentStatus = "closed";
      if (socket === ws) socket = null;
      connectingPromise = null;
      connectingReject = null;
      reject(new Error(`WebSocket connection to ${url} failed`));
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onErrorEarly);
  });
```

- [ ] **Step 3: Make `disconnect()` settle the pending connect**

Replace the existing `disconnect()` body:

```js
export function disconnect() {
  handlers.clear();
  if (socket) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  }
  socket = null;
  currentStatus = "closed";
  connectingPromise = null;
}
```

With:

```js
export function disconnect() {
  if (connectingReject) {
    connectingReject(new Error("WebSocket disconnect() called before connect resolved"));
    connectingReject = null;
  }
  handlers.clear();
  if (socket) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  }
  socket = null;
  currentStatus = "closed";
  connectingPromise = null;
}
```

- [ ] **Step 4: Verify the file parses**

```bash
node --check /mnt/d/Documents/trainee-zeus-26t1/frontend/src/lib/socket/client.js && echo "client.js: PARSE OK"
```

Expected: `client.js: PARSE OK`.

---

## Task 2: globalThis store + handler dedupe + `gameStarted` in `lobby.js`

**Files:**
- Modify: `frontend/src/lib/socket/lobby.js`

This task replaces lobby.js's module-local state with a globalThis-backed store so Fast Refresh re-evaluation doesn't stack duplicate WebSocket handlers. It also adds the `game:started` listener and exports `ensureConnected`.

- [ ] **Step 1: Replace the file's top section (state + handler attachment)**

Open `frontend/src/lib/socket/lobby.js`. Replace lines 1 through the end of the third top-level `on(...)` block (currently the `room:updated` handler closure, around line 59) — i.e. everything from the top-of-file comment through the `room:updated` `on(...)` registration. Use this block:

```js
// frontend/src/lib/socket/lobby.js
//
// Imperative one-shot lobby actions + module-level session store.
// Used by the home wizard to fire create / join before navigating to
// /waiting-room.
//
// Each action sends one event and awaits the matching server reply
// (or rejects on `room:error`). See docs/API.md for the protocol.

import { connect, on, send } from "./client";

// Persist the lobby store on globalThis so Next.js Fast Refresh re-
// evaluating this module does NOT stack duplicate WebSocket handlers
// in client.js. The handler closures below capture `store.state`,
// which lives on globalThis and therefore survives module re-eval.
const STORE_KEY = "__zeus_lobby_store_v1";
const INITIAL_STATE = {
  code: null,
  roomId: null,
  playerId: null,
  hostId: null,
  roundCount: null,
  players: [],
  gameStarted: false,
};

if (!globalThis[STORE_KEY]) {
  globalThis[STORE_KEY] = {
    state: { ...INITIAL_STATE },
    subscribers: new Set(),
    attached: false,
  };
}
const store = globalThis[STORE_KEY];

function setLobby(patch) {
  store.state = { ...store.state, ...patch };
  for (const fn of [...store.subscribers]) {
    try {
      fn(store.state);
    } catch (err) {
      console.error("[lobby] subscriber threw:", err);
    }
  }
}

function attachHandlersOnce() {
  if (store.attached) return;
  store.attached = true;

  on("room:created", (data) => {
    setLobby({
      code: data?.code ?? null,
      roomId: data?.roomId ?? null,
      playerId: data?.playerId ?? null,
      hostId: data?.playerId ?? null,
      players: data?.players ?? [],
      gameStarted: false,
    });
  });

  on("room:joined", (data) => {
    setLobby({
      code: data?.code ?? null,
      roomId: data?.roomId ?? null,
      playerId: data?.playerId ?? null,
      hostId: data?.hostId ?? null,
      roundCount: data?.roundCount ?? null,
      players: data?.players ?? [],
      gameStarted: false,
    });
  });

  on("room:updated", (data) => {
    setLobby({
      hostId: data?.hostId ?? store.state.hostId,
      players: data?.players ?? store.state.players,
    });
  });

  on("game:started", () => {
    setLobby({ gameStarted: true });
  });
}

attachHandlersOnce();
```

- [ ] **Step 2: Update `wsUrl`, `ensureConnected`, `awaitOne`**

The block immediately below the handler attachment in the existing file looks like:

```js
function wsUrl() {
  const base =
    (typeof process !== "undefined" &&
      process.env &&
      process.env.NEXT_PUBLIC_API_URL) ||
    "http://localhost:8000";
  return base.replace(/^http/, "ws") + "/ws/game";
}

async function ensureConnected() {
  await connect(wsUrl());
}

function awaitOne(eventOk, eventErr, predicate) {
  return new Promise((resolve, reject) => {
    let offOk = () => {};
    let offErr = () => {};
    offOk = on(eventOk, (data) => {
      if (predicate && !predicate(data)) return;
      offOk();
      offErr();
      resolve(data);
    });
    offErr = on(eventErr, (data) => {
      offOk();
      offErr();
      const err = new Error(data?.message ?? "room error");
      err.code = data?.code ?? "ROOM_ERROR";
      reject(err);
    });
  });
}
```

Promote `ensureConnected` to an export (one-word change). Replace that block with:

```js
function wsUrl() {
  const base =
    (typeof process !== "undefined" &&
      process.env &&
      process.env.NEXT_PUBLIC_API_URL) ||
    "http://localhost:8000";
  return base.replace(/^http/, "ws") + "/ws/game";
}

export async function ensureConnected() {
  await connect(wsUrl());
}

function awaitOne(eventOk, eventErr, predicate) {
  return new Promise((resolve, reject) => {
    let offOk = () => {};
    let offErr = () => {};
    offOk = on(eventOk, (data) => {
      if (predicate && !predicate(data)) return;
      offOk();
      offErr();
      resolve(data);
    });
    offErr = on(eventErr, (data) => {
      offOk();
      offErr();
      const err = new Error(data?.message ?? "room error");
      err.code = data?.code ?? "ROOM_ERROR";
      reject(err);
    });
  });
}
```

- [ ] **Step 3: Update `createRoom` / `leaveRoom` to clear/seed the new `gameStarted` field**

Locate `createRoom`. Replace the existing body:

```js
export async function createRoom(name, roundCount) {
  await ensureConnected();
  const reply = awaitOne("room:created", "room:error");
  send("room:create", { name, roundCount });
  const data = await reply;
  setLobby({ roundCount });
  return data;
}
```

With:

```js
export async function createRoom(name, roundCount) {
  await ensureConnected();
  const reply = awaitOne("room:created", "room:error");
  send("room:create", { name, roundCount });
  const data = await reply;
  setLobby({ roundCount, gameStarted: false });
  return data;
}
```

Then replace `leaveRoom`:

```js
export async function leaveRoom() {
  send("room:leave", {});
  setLobby({
    code: null,
    roomId: null,
    playerId: null,
    hostId: null,
    roundCount: null,
    players: [],
  });
}
```

With:

```js
export async function leaveRoom() {
  send("room:leave", {});
  setLobby({ ...INITIAL_STATE });
}
```

- [ ] **Step 4: Update `getSession` and `subscribeLobby` to read/write the new store**

The existing bottom of the file:

```js
export function getSession() {
  return lobbyState;
}

export function subscribeLobby(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
```

Becomes:

```js
export function getSession() {
  return store.state;
}

export function subscribeLobby(fn) {
  store.subscribers.add(fn);
  return () => store.subscribers.delete(fn);
}
```

- [ ] **Step 5: Verify the file parses**

```bash
node --check /mnt/d/Documents/trainee-zeus-26t1/frontend/src/lib/socket/lobby.js && echo "lobby.js: PARSE OK"
```

Expected: `lobby.js: PARSE OK`.

---

## Task 3: `ensureConnected` + `playerId` guard in `round.js`

**Files:**
- Modify: `frontend/src/lib/socket/round.js`

- [ ] **Step 1: Update the imports**

Locate the current import line:

```js
import { on, send } from "./client";
import { getSession } from "./lobby";
```

Replace with:

```js
import { on, send } from "./client";
import { ensureConnected, getSession } from "./lobby";
```

- [ ] **Step 2: Harden `submitRound`**

Replace the existing function:

```js
export async function submitRound(content) {
  const session = getSession();
  const reply = awaitOne(
    "round:player_submitted",
    "room:error",
    (data) => !session.playerId || data?.playerId === session.playerId,
  );
  send("round:submit", { content });
  await reply;
}
```

With:

```js
export async function submitRound(content) {
  const session = getSession();
  if (!session.playerId) throw new Error("not in a room");
  await ensureConnected();
  const reply = awaitOne(
    "round:player_submitted",
    "room:error",
    (data) => data?.playerId === session.playerId,
  );
  send("round:submit", { content });
  await reply;
}
```

- [ ] **Step 3: Gate `syncGame` on `ensureConnected`**

Replace:

```js
export async function syncGame(roomId, playerId) {
  const reply = awaitOne("game:state", "room:error");
  send("game:sync", { roomId, playerId });
  return reply;
}
```

With:

```js
export async function syncGame(roomId, playerId) {
  await ensureConnected();
  const reply = awaitOne("game:state", "room:error");
  send("game:sync", { roomId, playerId });
  return reply;
}
```

- [ ] **Step 4: Gate `resetGame` on `ensureConnected`**

Replace:

```js
export async function resetGame() {
  const reply = awaitOne("room:updated", "room:error");
  send("game:reset", {});
  await reply;
}
```

With:

```js
export async function resetGame() {
  await ensureConnected();
  const reply = awaitOne("room:updated", "room:error");
  send("game:reset", {});
  await reply;
}
```

- [ ] **Step 5: Verify the file parses**

```bash
node --check /mnt/d/Documents/trainee-zeus-26t1/frontend/src/lib/socket/round.js && echo "round.js: PARSE OK"
```

Expected: `round.js: PARSE OK`.

---

## Task 4: Expose `gameStarted` from `useLobby`

**Files:**
- Modify: `frontend/src/lib/socket/useLobby.js`

- [ ] **Step 1: Update the JSDoc return shape**

Find the JSDoc block above `export function useLobby()`. Replace the `@returns` shape:

```js
 * @returns {{
 *   roomCode: string | null,
 *   roomId:   string | null,
 *   playerId: string | null,
 *   hostId:   string | null,
 *   players:  Array<{id: string, name: string, ready: boolean, host: boolean}>,
 *   error:    {code: string, message: string} | null,
 *   isHost:   boolean,
 *   leave:    () => Promise<void>,
 *   start:    () => Promise<void>,
 * }}
```

With:

```js
 * @returns {{
 *   roomCode: string | null,
 *   roomId:   string | null,
 *   playerId: string | null,
 *   hostId:   string | null,
 *   players:  Array<{id: string, name: string, ready: boolean, host: boolean}>,
 *   error:    {code: string, message: string} | null,
 *   isHost:   boolean,
 *   gameStarted: boolean,
 *   leave:    () => Promise<void>,
 *   start:    () => Promise<void>,
 * }}
```

- [ ] **Step 2: Add `gameStarted` to the returned object**

The existing return block:

```js
  return {
    roomCode: snapshot.code ?? null,
    roomId: snapshot.roomId ?? null,
    playerId: snapshot.playerId ?? null,
    hostId: snapshot.hostId ?? null,
    players: mapPlayers(snapshot.players, snapshot.hostId),
    error,
    isHost,
    leave: leaveRoom,
    start: startGame,
  };
```

Becomes:

```js
  return {
    roomCode: snapshot.code ?? null,
    roomId: snapshot.roomId ?? null,
    playerId: snapshot.playerId ?? null,
    hostId: snapshot.hostId ?? null,
    players: mapPlayers(snapshot.players, snapshot.hostId),
    error,
    isHost,
    gameStarted: !!snapshot.gameStarted,
    leave: leaveRoom,
    start: startGame,
  };
```

- [ ] **Step 3: Verify the file parses**

```bash
node --check /mnt/d/Documents/trainee-zeus-26t1/frontend/src/lib/socket/useLobby.js && echo "useLobby.js: PARSE OK"
```

Expected: `useLobby.js: PARSE OK`.

---

## Task 5: `room:updated` reset, memoised actions, gated interval in `useRound.js`

**Files:**
- Modify: `frontend/src/lib/socket/useRound.js`

- [ ] **Step 1: Import `useCallback`**

Replace:

```js
import { useEffect, useRef, useState } from "react";
```

With:

```js
import { useCallback, useEffect, useRef, useState } from "react";
```

- [ ] **Step 2: Add the `room:updated` listener inside the existing subscription `useEffect`**

The existing `useEffect` block currently registers six listeners (`offBegin`, `offSubmitted`, `offEnded`, `offReveal`, `offOver`, `offError`) and returns a cleanup function. Add a seventh listener.

Find the cleanup block:

```js
    return () => {
      offBegin();
      offSubmitted();
      offEnded();
      offReveal();
      offOver();
      offError();
    };
```

Immediately BEFORE that `return`, add:

```js
    const offRoomUpdated = on("room:updated", () => {
      setState((prev) =>
        prev.status === "over" || prev.status === "reveal"
          ? { ...INITIAL }
          : prev,
      );
    });
```

Then update the cleanup return to include it:

```js
    return () => {
      offBegin();
      offSubmitted();
      offEnded();
      offReveal();
      offOver();
      offError();
      offRoomUpdated();
    };
```

- [ ] **Step 3: Gate the countdown interval on an active deadline**

The current second `useEffect`:

```js
  useEffect(() => {
    const id = setInterval(() => {
      if (deadlineRef.current == null) return;
      const remaining = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      );
      setState((prev) =>
        prev.secondsLeft === remaining
          ? prev
          : { ...prev, secondsLeft: remaining },
      );
    }, 250);
    return () => clearInterval(id);
  }, []);
```

Replace with a version that only ticks while a deadline is set (uses `state.secondsLeft` as the dependency to re-arm when a new round starts):

```js
  useEffect(() => {
    if (state.secondsLeft == null) return undefined;
    const id = setInterval(() => {
      if (deadlineRef.current == null) return;
      const remaining = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      );
      setState((prev) =>
        prev.secondsLeft === remaining
          ? prev
          : { ...prev, secondsLeft: remaining },
      );
    }, 250);
    return () => clearInterval(id);
  }, [state.secondsLeft == null]);
```

(The dependency uses the *truthiness* of `secondsLeft == null` so the effect re-arms only when the round becomes active or inactive — not on every tick.)

- [ ] **Step 4: Memoise `submit` and `reset`**

The existing lines at the bottom of the function:

```js
  const submit = async (content) => {
    await submitRound(content);
    setState((prev) => ({ ...prev, hasSubmitted: true }));
  };

  const reset = async () => {
    await resetGame();
    deadlineRef.current = null;
    setState(INITIAL);
  };

  return { ...state, submit, reset };
```

Replace with:

```js
  const submit = useCallback(async (content) => {
    await submitRound(content);
    setState((prev) => ({ ...prev, hasSubmitted: true }));
  }, []);

  const reset = useCallback(async () => {
    await resetGame();
    deadlineRef.current = null;
    setState({ ...INITIAL });
  }, []);

  return { ...state, submit, reset };
```

(`setState({ ...INITIAL })` clones INITIAL rather than passing the shared reference — defensive against any future mutation.)

- [ ] **Step 5: Verify the file parses**

```bash
node --check /mnt/d/Documents/trainee-zeus-26t1/frontend/src/lib/socket/useRound.js && echo "useRound.js: PARSE OK"
```

Expected: `useRound.js: PARSE OK`.

---

## Task 6: Create `<GameRouter>`

**Files:**
- Create: `frontend/src/components/socket/GameRouter.jsx`

- [ ] **Step 1: Verify the target directory exists**

```bash
ls /mnt/d/Documents/trainee-zeus-26t1/frontend/src/components/ && \
  mkdir -p /mnt/d/Documents/trainee-zeus-26t1/frontend/src/components/socket
```

Expected: existing components listed, no error from `mkdir -p`.

- [ ] **Step 2: Write the component**

Write this exact content to `frontend/src/components/socket/GameRouter.jsx`:

```jsx
"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLobby } from "@/lib/socket/useLobby";
import { useRound } from "@/lib/socket/useRound";

/**
 * Top-level navigator. Mounted once in app/layout.jsx. Subscribes to
 * useLobby() + useRound() and pushes the player's route when state
 * transitions across phases.
 *
 * Routing rule (see docs/superpowers/specs/2026-05-17-socket-bugfixes-
 * and-game-router-design.md):
 *   - no roomCode             → no auto-push (let the wizard own /)
 *   - status reveal/over      → /reveal
 *   - status active + code/1  → /editor
 *   - status active + describe→ /describe
 *   - status active + code/>1 → /reimplement
 *   - otherwise (idle/lobby)  → /waiting-room
 *
 * Guard rails:
 *   - pathname === "/"        → no push (don't yank user off the home wizard)
 *   - pathname === target     → no push (don't duplicate-navigate)
 */
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
      if (roundType === "code") {
        return roundNum === 1 ? "/editor" : "/reimplement";
      }
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

- [ ] **Step 3: Spot-check the imports resolve**

```bash
ls /mnt/d/Documents/trainee-zeus-26t1/frontend/src/lib/socket/useLobby.js \
   /mnt/d/Documents/trainee-zeus-26t1/frontend/src/lib/socket/useRound.js \
   /mnt/d/Documents/trainee-zeus-26t1/frontend/src/components/socket/GameRouter.jsx
```

Expected: all three paths listed without "No such file" errors.

(`node --check` won't parse JSX — defer parse verification to the dev server boot in Task 9.)

---

## Task 7: Mount `<GameRouter />` in the root layout

**Files:**
- Modify: `frontend/src/app/layout.jsx`

- [ ] **Step 1: Add the import**

Open `frontend/src/app/layout.jsx`. The current imports are:

```jsx
import "./globals.css";
import Superbar from "@/components/desktop/Superbar";
```

Add a third import:

```jsx
import "./globals.css";
import Superbar from "@/components/desktop/Superbar";
import GameRouter from "@/components/socket/GameRouter";
```

- [ ] **Step 2: Mount the component inside `<body>`**

The current return block:

```jsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="desktop-root">
          <div className="window-area">{children}</div>
          <Superbar />
        </div>
      </body>
    </html>
  );
}
```

Becomes:

```jsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <GameRouter />
        <div className="desktop-root">
          <div className="window-area">{children}</div>
          <Superbar />
        </div>
      </body>
    </html>
  );
}
```

(Mounted as the first child of `<body>` so it lives outside the desktop layout grid. It renders `null` regardless.)

- [ ] **Step 3: Verify the layout still imports**

JSX won't parse with `node --check`. The verification fires in Task 9 (dev server boot).

---

## Task 8: Fix the doc/spec drift

**Files:**
- Modify: `docs/API.md`
- Modify: `docs/superpowers/specs/2026-05-16-round-networking-stubs.md`

- [ ] **Step 1: Update `docs/API.md` — `round:begin` row**

In the **Server → client** events table, the existing row reads:

```
| `round:begin` | Start of a round; **per-connection** payload includes `seed` (prompt / inherited content) and timing hints. |
```

Replace with:

```
| `round:begin` | Start of a round; **per-connection** payload `{roundNum, roundType, seed, timeLimit}` — `seed` carries the prompt / inherited content; `timeLimit` is the round duration in seconds (the frontend derives a local `secondsLeft` countdown from it). |
```

- [ ] **Step 2: Update `docs/API.md` — `round:player_submitted` row**

The existing row:

```
| `round:player_submitted` | Progress broadcast when a player submits (counts toward round completion). |
```

Replace with:

```
| `round:player_submitted` | Progress broadcast when a player submits. Payload `{playerId, totalSubmitted, totalPlayers}` — counts toward round completion. |
```

- [ ] **Step 3: Update the round-networking spec — Server → client table**

Open `docs/superpowers/specs/2026-05-16-round-networking-stubs.md`. Find the **Server → client** table near the bottom. Replace these two rows:

```
| `round:begin` | `{roundNum, roundType, seed, secondsLeft}` — per-connection (each player's seed is different). `roundType` is `'code'` or `'describe'`; `seed` contains the camelCase RoundSeed payload (`promptText`/`starterLine` on round 1, `fromPlayerName`/`receivedContent` on later rounds). |
| `round:player_submitted` | `{playerId, submittedCount, totalPlayers}` |
```

With:

```
| `round:begin` | `{roundNum, roundType, seed, timeLimit}` — per-connection (each player's seed is different). `roundType` is `'code'` or `'describe'`; `seed` contains the camelCase RoundSeed payload (`promptText`/`starterLine` on round 1, `fromPlayerName`/`receivedContent` on later rounds). `timeLimit` is the round duration in seconds — the frontend derives a local `secondsLeft` countdown from it. |
| `round:player_submitted` | `{playerId, totalSubmitted, totalPlayers}` |
```

- [ ] **Step 4: Update the round-networking spec — `useRound()` JSDoc**

In the same spec file, find the `useRound` JSDoc block (inside the "Public Surface" → "`lib/socket/useRound.js`" section). The current return shape includes a `secondsLeft` field. Add an explanatory line immediately after that field. Find:

```
 *   secondsLeft:    number | null,         // for the countdown display
```

Replace with:

```
 *   secondsLeft:    number | null,         // derived locally from `timeLimit` via an interval — not read from the wire
```

- [ ] **Step 5: Sanity-check the doc edits**

```bash
grep -n "timeLimit\|totalSubmitted" /mnt/d/Documents/trainee-zeus-26t1/docs/API.md /mnt/d/Documents/trainee-zeus-26t1/docs/superpowers/specs/2026-05-16-round-networking-stubs.md
```

Expected: at least 4 matches (2 per file).

---

## Task 9: Verify dev server + browser smoke test

The stubs intentionally still don't do real WebSocket work in dev unless a backend is running. Verification target is "dev server boots, all routes render, GameRouter wiring is reachable."

- [ ] **Step 1: Start the dev server**

```bash
cd /mnt/d/Documents/trainee-zeus-26t1/frontend && npm run dev
```

Expected: Next.js banner with `Local: http://localhost:3000` (or 3001 if 3000 in use). No build errors mentioning `GameRouter`, `lib/socket/*`, or `layout.jsx`.

- [ ] **Step 2: Curl every route**

```bash
curl -s -o /dev/null -w "/             HTTP %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "/waiting-room HTTP %{http_code}\n" http://localhost:3000/waiting-room
curl -s -o /dev/null -w "/editor       HTTP %{http_code}\n" http://localhost:3000/editor
curl -s -o /dev/null -w "/describe     HTTP %{http_code}\n" http://localhost:3000/describe
curl -s -o /dev/null -w "/reimplement  HTTP %{http_code}\n" http://localhost:3000/reimplement
curl -s -o /dev/null -w "/reveal       HTTP %{http_code}\n" http://localhost:3000/reveal
```

Expected: all six return `HTTP 200`.

- [ ] **Step 3: Direct-navigate smoke test (no backend required)**

Open `http://localhost:3000/` in a browser.

Expected:
- The home wizard renders. No console errors mentioning `useLobby`, `useRound`, `GameRouter`.
- Pathname stays `/` (GameRouter's `pathname === "/"` guard is in effect).

Navigate directly to `http://localhost:3000/waiting-room`.

Expected:
- Page renders. Because `useLobby()` returns `roomCode: null` (no `room:created` yet), GameRouter computes `target === "/"`. But the guard `pathname === "/"` is FALSE (we're on `/waiting-room`) and `pathname === target` is FALSE, so GameRouter pushes to `/`.
- Browser ends up back on `/`. **This is correct behaviour** — visiting an in-game route without an active session bounces you back to the wizard. The user sees a brief flicker before landing on `/`.

If this bounce is too disruptive in dev, the user can comment out `<GameRouter />` in `layout.jsx` temporarily, but the default behaviour is correct for production.

- [ ] **Step 4: End-to-end happy path (requires backend running)**

Optional but worth running if the user has Uvicorn started. Open three browser tabs.

Tab 1: type nickname "Alice", **Create a new room**, click **Finish**. Wizard pushes to `/waiting-room`. Note the room code shown.

Tab 2: type nickname "Bob", **Join an existing room**, paste the code from Tab 1, click **Finish**.

Tab 3: type nickname "Carla", **Join an existing room**, paste the code, click **Finish**.

In Tab 1, click **Start Game**.

Expected: all three tabs navigate to `/editor`. (This is the load-bearing acceptance criterion — without GameRouter, Tabs 2 and 3 would stay on `/waiting-room`.)

If the backend isn't running, skip this step; the wizard's `createRoom` will throw "WebSocket connection... failed" and Tab 1 won't navigate. That's expected without the backend.

- [ ] **Step 5: Stop the dev server**

Ctrl-C in the terminal running `npm run dev`.

---

## Final review (don't commit)

- [ ] **Step 1: Show the diff**

```bash
git -C /mnt/d/Documents/trainee-zeus-26t1 status
git -C /mnt/d/Documents/trainee-zeus-26t1 diff --stat
```

Expected unstaged changes:

- New: `frontend/src/components/socket/GameRouter.jsx`
- Modified:
  - `frontend/src/lib/socket/client.js`
  - `frontend/src/lib/socket/lobby.js`
  - `frontend/src/lib/socket/round.js`
  - `frontend/src/lib/socket/useLobby.js`
  - `frontend/src/lib/socket/useRound.js`
  - `frontend/src/app/layout.jsx`
  - `docs/API.md`
  - `docs/superpowers/specs/2026-05-16-round-networking-stubs.md`

(Plus the new spec + plan docs already on disk.)

- [ ] **Step 2: Hand off**

Do NOT run `git add` or `git commit`. Summarize what was changed and the key user-visible behaviour: the game now flows end-to-end through phases without per-page navigation code, and the socket library no longer hangs on closed-socket actions or stacks duplicate handlers on Fast Refresh.

---

## Self-Review

### Spec coverage check

| Spec section                                       | Plan task     |
|----------------------------------------------------|---------------|
| Architecture: `<GameRouter>` component             | Task 6, 7     |
| State → route table                                | Task 6 (sketch matches table) |
| Guard rails (`/` and `pathname === target`)        | Task 6        |
| `client.js`: disconnect rejects pending connect    | Task 1        |
| `lobby.js`: globalThis store + dedupe              | Task 2        |
| `lobby.js`: `room:updated` preserves players       | Task 2 Step 1 (`?? store.state.players`) |
| `lobby.js`: `game:started` listener                | Task 2 Step 1 |
| `lobby.js`: export `ensureConnected`               | Task 2 Step 2 |
| `round.js`: `ensureConnected` in all 3 actions     | Task 3 Steps 2-4 |
| `round.js`: reject `submitRound` when no playerId  | Task 3 Step 2 |
| `useLobby.js`: expose `gameStarted`                | Task 4        |
| `useRound.js`: `room:updated` resets `over/reveal` | Task 5 Step 2 |
| `useRound.js`: memoise `submit` + `reset`          | Task 5 Step 4 |
| `useRound.js`: gate countdown interval             | Task 5 Step 3 |
| `app/layout.jsx`: mount `<GameRouter />`           | Task 7        |
| `docs/API.md` field names                          | Task 8 Steps 1-2 |
| Round-networking spec field names + JSDoc note     | Task 8 Steps 3-4 |

All spec requirements covered.

### Placeholder scan

No TBD / "implement later" / "similar to Task N" patterns in any task. All code blocks complete.

### Type consistency

- `ensureConnected` exported in Task 2, imported in Task 3 ✓
- `gameStarted` set in `lobby.js` (Task 2), exposed in `useLobby.js` (Task 4) ✓
- `INITIAL` constant in `useRound.js` referenced consistently in Tasks 5.2 and 5.4 ✓
- `store.state` accessed identically in `setLobby` (Task 2.1), `getSession` (Task 2.4), and the `room:updated` handler (Task 2.1) ✓
- `globalThis` `STORE_KEY` `"__zeus_lobby_store_v1"` — single key, no collisions
