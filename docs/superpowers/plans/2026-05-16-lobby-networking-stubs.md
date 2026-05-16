# Lobby Networking Stubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create function stubs (signatures + JSDoc + TODO bodies) for the frontend WebSocket lobby client, and wire the home wizard + waiting room to import them. A teammate will fill in the bodies later.

**Architecture:** Three small files under `frontend/src/lib/socket/` — a singleton WebSocket client (`client.js`), imperative lobby actions (`lobby.js`), and a React hook (`useLobby.js`). The wizard imports `lobby.js` for one-shot actions before navigating; the waiting room subscribes to `useLobby()` for reactive state. Stubs throw `not implemented` from imperative functions; the hook returns a safe default shape so pages still render.

**Tech Stack:** Plain JavaScript (`.js`, no TS), React 19 / Next.js 16 App Router, native `WebSocket`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-16-lobby-networking-stubs.md`

**Commit policy:** This project does not auto-commit. Leave changes unstaged so the user can review and commit themselves.

---

## File Map

- **Create:** `frontend/src/lib/socket/client.js` — singleton WebSocket wrapper
- **Create:** `frontend/src/lib/socket/lobby.js` — imperative lobby actions
- **Create:** `frontend/src/lib/socket/useLobby.js` — React hook
- **Modify:** `frontend/src/app/page.jsx` — wire `handleNext` to lobby actions
- **Modify:** `frontend/src/app/waiting-room/page.jsx` — convert to client component, swap mock constants for the hook

---

## Task 1: Create `lib/socket/client.js`

**Files:**
- Create: `frontend/src/lib/socket/client.js`

- [ ] **Step 1: Write the file**

```js
// frontend/src/lib/socket/client.js
//
// Singleton WebSocket client for the Code Telephone backend (`/ws/game`).
// Stub only — bodies are intentionally unimplemented. See
// docs/superpowers/specs/2026-05-16-lobby-networking-stubs.md and
// docs/API.md for the protocol.

/**
 * Open the connection. Idempotent — calling again while already
 * connecting or open should return / reuse the existing socket.
 *
 * @param {string} url - e.g. `ws://localhost:8000/ws/game`. Derive from
 *                       `process.env.NEXT_PUBLIC_API_URL` with the
 *                       scheme swapped to `ws://` or `wss://`.
 * @returns {Promise<void>} Resolves when the socket reaches `open`,
 *                          rejects if the connection fails.
 */
export async function connect(url) {
  // TODO: implement
  throw new Error("not implemented");
}

/**
 * Send a JSON frame `{event, data}` over the socket. No-op (do NOT throw)
 * if the socket is not currently open — the higher-level lobby actions
 * are responsible for ensuring `connect()` resolved first.
 *
 * @param {string} event - e.g. `"room:create"`
 * @param {object} data  - payload object (will be JSON-stringified)
 */
export function send(event, data) {
  // TODO: implement
  throw new Error("not implemented");
}

/**
 * Register a handler for inbound events of the given name. Multiple
 * handlers per event are allowed and called in registration order.
 *
 * @param {string} event - e.g. `"room:updated"`
 * @param {(data: object) => void} handler - called with the `data`
 *                                            field of the inbound frame
 * @returns {() => void} unsubscribe function
 */
export function on(event, handler) {
  // TODO: implement
  throw new Error("not implemented");
}

/**
 * Close the socket and clear all registered handlers.
 */
export function disconnect() {
  // TODO: implement
  throw new Error("not implemented");
}

/**
 * @returns {"idle" | "connecting" | "open" | "closed"}
 */
export function status() {
  // TODO: implement
  return "idle";
}
```

- [ ] **Step 2: Verify the file parses**

Run: `node --check frontend/src/lib/socket/client.js`
Expected: exit 0, no output.

---

## Task 2: Create `lib/socket/lobby.js`

**Files:**
- Create: `frontend/src/lib/socket/lobby.js`

- [ ] **Step 1: Write the file**

```js
// frontend/src/lib/socket/lobby.js
//
// Imperative one-shot lobby actions. Used by the home wizard to fire
// create / join before navigating to /waiting-room.
//
// Each action sends one event and awaits the matching server reply
// (or rejects on `room:error`). See docs/API.md for the protocol.

/**
 * Send `room:create`. Resolves with the `room:created` reply payload,
 * or rejects with the `room:error` payload.
 *
 * @param {string} name - player nickname (non-empty)
 * @param {3 | 5} roundCount
 * @returns {Promise<{roomId: string, code: string, playerId: string, players: object[]}>}
 */
export async function createRoom(name, roundCount) {
  // TODO: implement
  // - ensure client is connected (call client.connect first)
  // - register a one-shot handler for `room:created` AND `room:error`
  // - send `room:create` with {name, roundCount}
  // - resolve / reject accordingly
  throw new Error("not implemented");
}

/**
 * Send `room:join`. Resolves with the `room:joined` reply, or rejects
 * with `room:error`.
 *
 * @param {string} code - room code, e.g. `"ROOM-4829"`
 * @param {string} name - player nickname
 * @returns {Promise<{roomId: string, code: string, playerId: string, players: object[], hostId: string, roundCount: number}>}
 */
export async function joinRoom(code, name) {
  // TODO: implement
  throw new Error("not implemented");
}

/**
 * Send `room:leave`. Fire-and-forget — no server reply.
 * @returns {Promise<void>}
 */
export async function leaveRoom() {
  // TODO: implement
  throw new Error("not implemented");
}

/**
 * Send `game:start`. Host only. Resolves with the `game:started` reply
 * (or rejects with `room:error` if the caller is not host / too few players).
 *
 * @returns {Promise<{roundCount: number, timeLimits: object}>}
 */
export async function startGame() {
  // TODO: implement
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Verify the file parses**

Run: `node --check frontend/src/lib/socket/lobby.js`
Expected: exit 0.

---

## Task 3: Create `lib/socket/useLobby.js`

**Critical design note:** This hook runs on every render of `/waiting-room`. If the hook itself threw `not implemented`, the page would crash before the teammate can implement it. So the hook returns a **safe default shape** that matches its JSDoc; only the bound action methods throw when invoked.

**Files:**
- Create: `frontend/src/lib/socket/useLobby.js`

- [ ] **Step 1: Write the file**

```js
// frontend/src/lib/socket/useLobby.js
//
// React hook exposing reactive lobby state + bound actions. Subscribes
// to the singleton client.js, listens for `room:updated`, `room:error`,
// and `game:started`.
//
// Stub: returns the default empty shape so pages render. The bound
// `leave` and `start` methods throw on invocation until implemented.

/**
 * Subscribe to lobby state. The state shape mirrors what the waiting
 * room renders. `isHost` is derived: `playerId === hostId`.
 *
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
 */
export function useLobby() {
  // TODO: implement
  // - subscribe to client.on("room:updated", ...) etc. via useEffect
  // - hold reactive state with useState or useSyncExternalStore
  // - bind leave/start to lobby.leaveRoom / lobby.startGame
  //
  // Returning the default empty shape so /waiting-room renders during
  // the stub phase. Once implemented, the bound actions should also
  // stop throwing on invocation.
  return {
    roomCode: null,
    roomId: null,
    playerId: null,
    hostId: null,
    players: [],
    error: null,
    isHost: false,
    leave: async () => {
      throw new Error("not implemented");
    },
    start: async () => {
      throw new Error("not implemented");
    },
  };
}
```

- [ ] **Step 2: Verify the file parses**

Run: `node --check frontend/src/lib/socket/useLobby.js`
Expected: exit 0.

---

## Task 4: Wire `app/page.jsx`

**Files:**
- Modify: `frontend/src/app/page.jsx` — `handleNext` only; rest of file untouched

- [ ] **Step 1: Add the import**

At the top of the file (after the existing imports, before the comment block):

```js
import { createRoom, joinRoom } from "@/lib/socket/lobby";
```

- [ ] **Step 2: Replace `handleNext`**

Replace the existing `handleNext`:

```js
const handleNext = () => {
  if (!canAdvance) return;
  if (isLast) {
    /* In a real wired-up app: create / join / matchmake.
       For static UI, all three land in the waiting room. */
    router.push("/waiting-room");
  } else {
    setStep(step + 1);
  }
};
```

With this method-aware version:

```js
const handleNext = async () => {
  if (!canAdvance) return;
  if (!isLast) {
    setStep(step + 1);
    return;
  }

  // TODO: surface errors to the user (room:error → toast or inline message).
  //       For now, errors bubble up and reach the console only.
  try {
    if (method === "create") {
      await createRoom(nickname, /* roundCount */ 3);
    } else if (method === "join") {
      await joinRoom(joinInput, nickname);
    } else {
      // TODO: quick play — backend has no matchmake endpoint yet.
    }
    router.push("/waiting-room");
  } catch (err) {
    // TODO: render the error somewhere the user can see it.
    console.error("[wizard] lobby action failed:", err);
  }
};
```

- [ ] **Step 3: Verify the file parses**

Run: `node --check frontend/src/app/page.jsx`
Expected: exit 0 (Node won't resolve `@/` but will parse JSX through experimental flags — if `node --check` chokes on JSX, skip and rely on the dev server check in Task 6 instead).

Note: if `node --check` fails on JSX syntax (likely — Node doesn't parse JSX natively), defer parse verification to Task 6 (dev server boot).

---

## Task 5: Wire `app/waiting-room/page.jsx`

This task converts the file to a client component and replaces the module-level mock constants with hook-driven state. **Preserve the layout and CSS exactly** — only the data source changes.

**Files:**
- Modify: `frontend/src/app/waiting-room/page.jsx`

- [ ] **Step 1: Add `"use client"` and the hook import**

At the very top of the file, before any imports:

```js
"use client";
```

After the existing imports, add:

```js
import { useLobby } from "@/lib/socket/useLobby";
```

- [ ] **Step 2: Remove the mock data, keep the static constants**

The language radio group stays static (the protocol has no language field yet). Only the room code and the player list become hook-driven.

Delete these two declarations:

```js
const ROOM_CODE = "ROOM-4829";

const players = [
  { id: 1, name: "Jordan",  initials: "JS", ready: true,  host: true  },
  { id: 2, name: "Amrita",  initials: "AM", ready: true,  host: false },
  { id: 3, name: "Lukas",   initials: "LK", ready: false, host: false },
];
```

Leave the remaining module-level constants in place:

```js
const MAX_PLAYERS = 6;

const languages = [
  { id: "python",     label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "java",       label: "Java" },
];

const SELECTED_LANG = "python";
```

- [ ] **Step 3: Replace the function body header**

Replace:

```js
export default function WaitingRoom() {
  const emptySlots = MAX_PLAYERS - players.length;
```

With:

```js
export default function WaitingRoom() {
  const { roomCode, players, isHost, error, leave, start } = useLobby();

  // TODO: render `error` (room:error payload) somewhere visible.
  // TODO: render a loading / empty state when `roomCode` is null
  //       (e.g. on first paint before the server replies).

  const displayRoomCode = roomCode ?? "—";
  const emptySlots = Math.max(0, MAX_PLAYERS - players.length);
```

- [ ] **Step 4: Update the JSX references**

In the title:

```jsx
title={`Code Telephone — Waiting Room — ${ROOM_CODE}`}
```

Becomes:

```jsx
title={`Code Telephone — Waiting Room — ${displayRoomCode}`}
```

In the room code display:

```jsx
<div className={styles.roomCode}>{ROOM_CODE}</div>
```

Becomes:

```jsx
<div className={styles.roomCode}>{displayRoomCode}</div>
```

In the `PlayerAvatar` render — the mock data had `initials` and `seed`; the protocol payload doesn't include `initials` (only `id`, `name`, `ready`, `host`). Update:

```jsx
<PlayerAvatar initials={p.initials} seed={p.name} />
```

To derive initials from the name:

```jsx
<PlayerAvatar initials={p.name.slice(0, 2).toUpperCase()} seed={p.name} />
```

In the action buttons, replace:

```jsx
<Button>Leave</Button>
```

With:

```jsx
<Button onClick={() => { leave().catch((err) => console.error(err)); }}>
  Leave
</Button>
```

And replace:

```jsx
<Button variant="primary">Start Game</Button>
```

With:

```jsx
<Button
  variant="primary"
  disabled={!isHost}
  onClick={() => { start().catch((err) => console.error(err)); }}
>
  Start Game
</Button>
```

- [ ] **Step 5: Verify the file parses (deferred to Task 6)**

Skip `node --check` here for the same reason as Task 4 — JSX. Task 6 catches parse errors via the dev server.

---

## Task 6: Verify everything renders

The stubs intentionally do nothing, so there's no behavior to test. The verification target is: **dev server boots, both pages render, no console errors related to the stubs.**

- [ ] **Step 1: Start the dev server**

Run from the repo root:

```bash
cd frontend && npm run dev
```

Expected output: Next.js banner with `Local: http://localhost:3000`. No build errors mentioning `lib/socket/*` or `useLobby`.

- [ ] **Step 2: Load the home wizard**

Open `http://localhost:3000` in a browser (or via Playwright MCP if available).

Expected: nickname step renders. Type a nickname, click **Next**. Method step renders. Select "Create a new room", click **Finish**.

Expected behavior with stubs: the `await createRoom(...)` call **throws "not implemented"**, the `console.error("[wizard] lobby action failed:", err)` line runs, and the user stays on the wizard (no navigation). This is the correct stub behavior — the teammate will make it work.

- [ ] **Step 3: Load the waiting room directly**

Navigate directly to `http://localhost:3000/waiting-room`.

Expected:
- The window chrome and layout render.
- Room code shows as `—` (em dash, from the `roomCode ?? "—"` fallback).
- Players list shows 6 empty slots (since `players` is `[]` and `MAX_PLAYERS` is 6).
- "Start Game" button is disabled (since `isHost` is false).
- Clicking "Leave" logs `Error: not implemented` to the console; no crash.

- [ ] **Step 4: Stop the dev server**

Ctrl-C in the terminal running `npm run dev`.

---

## Final review (don't commit)

- [ ] **Step 1: Show the diff**

Run:

```bash
git -C /mnt/d/Documents/trainee-zeus-26t1 status
git -C /mnt/d/Documents/trainee-zeus-26t1 diff
```

Expected unstaged changes:
- New files: `frontend/src/lib/socket/{client.js,lobby.js,useLobby.js}`
- Modified: `frontend/src/app/page.jsx`, `frontend/src/app/waiting-room/page.jsx`

- [ ] **Step 2: Hand off to the user**

Do NOT run `git add` or `git commit`. The user will stage and commit themselves. Summarize what was created and where the teammate should start (the open TODOs in each file).
