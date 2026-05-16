# Lobby Networking Stubs — Design

**Date:** 2026-05-16
**Status:** Approved, ready for implementation
**Scope:** Frontend WebSocket client + lobby-phase wiring. Function stubs only — bodies are `// TODO` for the teammate to fill in.

## Goal

Wire the existing static UI to the existing backend WebSocket at `/ws/game`. This pass creates the shape (file structure, exports, JSDoc contracts, page integration) but leaves implementation to a teammate.

## Scope

**In:**
- Singleton WebSocket client wrapper
- Lobby-phase imperative actions (`createRoom`, `joinRoom`, `leaveRoom`, `startGame`)
- Reactive React hook for waiting-room state
- Wiring stubs in `app/page.jsx` (wizard) and `app/waiting-room/page.jsx`

**Out (deferred to later passes):**
- Round-phase events (`round:submit`, `game:sync`, `round:begin`, etc.)
- Quick play / matchmaking — backend has no endpoint yet
- Error UI surface (toast / dialog component)
- URL deep-link `/r/ROOM-XXXX` prefilling the join input
- Reconnect / `game:sync` recovery flow

## File Structure

```
frontend/src/lib/socket/
├── client.js        ← low-level WebSocket: connect, send, on, disconnect, status
├── lobby.js         ← lobby actions: createRoom, joinRoom, leaveRoom, startGame
└── useLobby.js      ← React hook exposing lobby state + bound actions
```

All three are `.js` (no JSX). Pattern mirrors the existing `lib/supabase/client.js`. Round-phase stubs will land alongside as `round.js` + `useRound.js` later.

## Public Surface

### `lib/socket/client.js` — singleton WebSocket wrapper

```js
/** Open the connection. Idempotent — repeat calls return the existing socket. */
export function connect(url) { /* TODO */ }

/** Send `{event, data}` as a JSON frame. No-op if not connected. */
export function send(event, data) { /* TODO */ }

/** Register a handler for an inbound event. Returns an unsubscribe fn. */
export function on(event, handler) { /* TODO */ }

/** Close the socket and clear all handlers. */
export function disconnect() { /* TODO */ }

/** @returns {'idle' | 'connecting' | 'open' | 'closed'} */
export function status() { /* TODO */ }
```

The connection is a module-level singleton so it survives the wizard → waiting-room route change.

### `lib/socket/lobby.js` — imperative one-shot actions

Used by the home wizard to fire create/join before navigating.

```js
/** Send `room:create`. Resolves with the `room:created` reply, or rejects on `room:error`. */
export async function createRoom(name, roundCount) { /* TODO */ }

/** Send `room:join`. Resolves with `room:joined`, or rejects on `room:error`. */
export async function joinRoom(code, name) { /* TODO */ }

export async function leaveRoom() { /* TODO */ }
export async function startGame() { /* TODO */ }
```

Each function sends one event and awaits the matching server reply (or `room:error`).

### `lib/socket/useLobby.js` — React hook for reactive state

Used by the waiting room to render players/host/errors.

```js
/**
 * @returns {{
 *   roomCode: string|null,
 *   roomId:   string|null,
 *   playerId: string|null,
 *   hostId:   string|null,
 *   players:  Array<{id, name, ready, host}>,
 *   error:    {code, message}|null,
 *   isHost:   boolean,
 *   leave:    () => Promise<void>,
 *   start:    () => Promise<void>,
 * }}
 */
export function useLobby() { /* TODO */ }
```

Subscribes to the singleton client. Listens for `room:updated`, `room:error`, `game:started`.

## Page Wiring

### `app/page.jsx` (home wizard)

Replace the unconditional `router.push("/waiting-room")` with method-aware dispatch:

```js
import { createRoom, joinRoom } from "@/lib/socket/lobby";

const handleNext = async () => {
  if (!canAdvance) return;
  if (!isLast) { setStep(step + 1); return; }

  // TODO: surface errors to the user (room:error → toast or inline)
  if (method === "create") {
    await createRoom(nickname, /* roundCount */ 3);
  } else if (method === "join") {
    await joinRoom(joinInput, nickname);
  } else {
    // TODO: quick play — needs a matchmake endpoint, not yet defined
  }
  router.push("/waiting-room");
};
```

### `app/waiting-room/page.jsx`

Convert to a client component, replace mock constants with the hook. Layout / CSS untouched.

```js
"use client";
import { useLobby } from "@/lib/socket/useLobby";

export default function WaitingRoom() {
  const { roomCode, players, isHost, leave, start, error } = useLobby();

  // TODO: render `error` (room:error) somewhere visible
  // TODO: render an empty / loading state when roomCode is null
  // ...existing JSX, driven from hook state instead of module-level consts
}
```

The mock arrays (`players`, `languages`, constants `ROOM_CODE`, `SELECTED_LANG`) are removed. The `<Button>` "Start Game" wires to `start`; the "Leave" button wires to `leave`. The language radio group stays static for now (no backend protocol field for language yet).

## Backend Protocol Reference

From `docs/API.md`. Stubs cover only the lobby-phase rows.

**Client → server:**

| Event | Payload |
|---|---|
| `room:create` | `{name, roundCount: 3\|5}` |
| `room:join` | `{code, name}` |
| `room:leave` | `{}` |
| `game:start` | `{}` (host only, needs ≥3 players) |

**Server → client:**

| Event | Payload |
|---|---|
| `room:created` | `{roomId, code, playerId, players}` |
| `room:joined` | `{roomId, code, playerId, players, hostId, roundCount}` |
| `room:updated` | `{players, hostId}` |
| `room:error` | `{code, message}` |
| `game:started` | `{roundCount, timeLimits}` |

## Open TODOs (left in code for the teammate)

- Connection URL — should come from `NEXT_PUBLIC_API_URL` (browser) with `ws://` scheme swap
- Error UI — `room:error` needs a visual surface
- Loading / empty state on waiting room when `roomCode` is null
- Quick play — backend endpoint TBD
- Round-phase events — separate stub pass
- Reconnect / `game:sync` — separate pass

## Acceptance

The teammate can read the JSDoc and the open TODOs and fill in function bodies without needing to consult this spec or `docs/API.md` further.
