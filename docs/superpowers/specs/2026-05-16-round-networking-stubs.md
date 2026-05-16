# Round Networking Stubs — Design

**Date:** 2026-05-16
**Status:** Approved, ready for implementation
**Scope:** Frontend round-phase WebSocket actions + reactive hook + wiring of the three round pages. Function stubs only — bodies are `// TODO` for the teammate to fill in.

**Related:** Subsystem #1 of the "game logic stubs" series. Subsystems #2 (AI judge), #3 (ELO persistence), #4 (reveal screen) follow.

## Goal

Extend the existing `lib/socket/` library to cover the round-phase protocol (`round:submit`, `round:begin`, `round:player_submitted`, `round:ended`, `game:sync`, `game:reset`, `game:reveal`, `game:over`). Wire the three round-phase pages (`/editor`, `/describe`, `/reimplement`) to consume hook state instead of module-level mocks.

## Scope

**In:**
- New imperative actions: `submitRound`, `syncGame`, `resetGame`
- New React hook: `useRound`
- Wiring stubs for `app/editor/page.jsx`, `app/describe/page.jsx`, `app/reimplement/page.jsx`

**Out (deferred):**
- The reveal screen itself (subsystem #4)
- A "waiting for other players" screen between submit and next round-begin
- Language protocol negotiation — backend has no `language` field; stub uses `"Python"` default and flags as TODO
- Persistence of submissions (round content lives in memory on backend per `manager.py`)

## File Structure

```
frontend/src/lib/socket/
├── client.js        ← (existing — singleton WebSocket wrapper)
├── lobby.js         ← (existing — lobby actions)
├── useLobby.js      ← (existing — lobby hook)
├── round.js         ← NEW: round-phase imperative actions
└── useRound.js      ← NEW: round-phase React hook
```

Both new files are `.js` (no JSX). Mirrors the lobby pattern. Round and lobby hooks are kept separate — they have different lifetimes (lobby state is pre-game and post-game; round state is mid-game).

## Public Surface

### `lib/socket/round.js` — imperative one-shot actions

```js
/**
 * Send `round:submit` for the active round. Resolves once the server
 * broadcasts `round:player_submitted` for this player (or rejects on
 * `room:error`, e.g. "already submitted" or "no active round").
 *
 * @param {string} content - The submission text. For write/reimplement
 *                           rounds this is code; for describe rounds it
 *                           is the plain-English description.
 * @returns {Promise<void>}
 */
export async function submitRound(content) { /* TODO */ }

/**
 * Send `game:sync` to reattach the current socket to an existing room
 * + player (after reconnect). Resolves with the `game:state` snapshot.
 *
 * @param {string} roomId
 * @param {string} playerId
 * @returns {Promise<{
 *   status: 'lobby' | 'active' | 'over',
 *   roundNum: number,
 *   roundType: 'code' | 'describe' | null,
 *   timeRemaining: number | null,
 *   seed: {
 *     promptText?: string | null,
 *     starterLine?: string | null,
 *     fromPlayerName?: string | null,
 *     receivedContent?: string | null,
 *   } | null,
 *   submitted: boolean,
 *   players: Array<{id: string, name: string, isHost: boolean}>,
 * }>}
 */
export async function syncGame(roomId, playerId) { /* TODO */ }

/**
 * Send `game:reset` to return the room to lobby after game end.
 * Host only — non-host calls reject with `room:error`. Resolves on the
 * next `room:updated` broadcast.
 *
 * @returns {Promise<void>}
 */
export async function resetGame() { /* TODO */ }
```

### `lib/socket/useRound.js` — React hook

```js
/**
 * Subscribe to round state. Subscribes to the singleton client and
 * listens for: `round:begin`, `round:player_submitted`, `round:ended`,
 * `game:reveal`, `game:over`, `room:error`.
 *
 * The stub returns the default empty shape so the round pages render
 * without crashing.
 *
 * @returns {{
 *   // 'reveal' and 'idle' are client-only states.
 *   // The server's GameStatus is 'lobby' | 'active' | 'over'.
 *   status:         'idle' | 'lobby' | 'active' | 'reveal' | 'over',
 *   roundNum:       number | null,        // 1-indexed
 *   // roundType from the server is 'code' | 'describe' only.
 *   // The frontend uses (roundNum, roundType) together to decide
 *   // which round page renders (editor / describe / reimplement).
 *   roundType:      'code' | 'describe' | null,
 *   seed:           {
 *                     promptText?: string | null,     // round 1 only
 *                     starterLine?: string | null,    // round 1 only
 *                     fromPlayerName?: string | null, // rounds > 1
 *                     receivedContent?: string | null,// rounds > 1
 *                   } | null,
 *   secondsLeft:    number | null,         // derived locally from `timeLimit` via an interval — not read from the wire
 *   hasSubmitted:   boolean,
 *   submittedCount: number,                // players who've submitted this round
 *   totalPlayers:   number,
 *   chains:         object[] | null,       // populated when status === 'reveal'
 *   error:          { code: string, message: string } | null,
 *   submit:         (content: string) => Promise<void>,
 * }}
 */
export function useRound() { /* TODO */ }
```

## Page Wiring

All three pages currently have module-level mock constants. The wiring strategy is identical across them:

1. Add `"use client"` at the top.
2. Import `useRound`.
3. Remove the mock constants.
4. Destructure hook state in the component.
5. Drive existing JSX from hook state (no layout changes).
6. Wire the submit button.

### `app/editor/page.jsx` (Write phase — round 1, `roundType === 'code'`)

- Reads `seed.promptText` and `seed.starterLine` (both round-1 only).
- Language hardcoded to `"python"` (not in protocol — see open question below).
- Submit button calls `submit(editorValue)`.

### `app/describe/page.jsx` (Describe phase — `roundType === 'describe'`)

- Reads `seed.receivedContent` (the upstream player's code) for the read-only panel.
- Language hardcoded to `"python"`.
- Submit button calls `submit(textareaValue)`.

### `app/reimplement/page.jsx` (Reimplement phase — `roundType === 'code'` with `roundNum > 1`)

- Reads `seed.receivedContent` (the upstream player's description) for the read-only panel.
- Starter code is empty — server sends no `starterLine` on rounds > 1.
- Language hardcoded to `"python"`.
- Submit button calls `submit(editorValue)`.

All three pages should:
- Display `secondsLeft` in the existing timer / PhaseHUD slot.
- Disable submit when `hasSubmitted === true`.
- Show `submittedCount / totalPlayers` in the existing "ready count" slot.
- Render an error message via `error` (TODO: design the visual treatment — flagged for the reveal-screen subsystem, since both need an error UI).

The pages do NOT route between themselves. The page that renders for the current round is determined by `roundType`. **Open question for the teammate filling in bodies:** should the hook navigate (`router.push("/editor")` etc.) when `round:begin` arrives, or should there be a single `/game` route that swaps the layout based on `roundType`? The current static UI has separate routes. The stub keeps them separate; the wiring teammate can refactor if useful.

## Backend Protocol Reference

From `docs/API.md` and `backend/app/game/manager.py`. Stubs cover the round-phase rows.

**Client → server:**

| Event | Payload |
|---|---|
| `round:submit` | `{content: string}` |
| `game:sync` | `{roomId, playerId}` |
| `game:reset` | `{}` (host only, requires `status === 'over'`) |

**Server → client:**

| Event | Payload |
|---|---|
| `round:begin` | `{roundNum, roundType, seed, timeLimit}` — per-connection (each player's seed is different). `roundType` is `'code'` or `'describe'`; `seed` contains the camelCase RoundSeed payload (`promptText`/`starterLine` on round 1, `fromPlayerName`/`receivedContent` on later rounds). `timeLimit` is the round duration in seconds — the frontend derives a local `secondsLeft` countdown from it. |
| `round:player_submitted` | `{playerId, totalSubmitted, totalPlayers}` |
| `round:ended` | `{submissions, nextRound?}` |
| `game:reveal` | `{chains}` |
| `game:over` | `{}` |
| `game:state` | (snapshot for reconnect) |

## Stub Behaviour

Same pattern as the lobby stubs:

- **Imperative actions** (`round.js`) throw `not implemented` when invoked.
- **`useRound()`** returns the default empty shape so pages render. Its bound `submit` method throws when invoked.
- Page-level button clicks `.catch(console.error)` the throws so the dev experience doesn't blow up.

## Acceptance

A teammate can read the JSDoc on `round.js` and `useRound.js` plus the per-page TODOs and fill in the bodies without consulting this spec or `docs/API.md` further.

The dev server boots, all three round-phase routes return HTTP 200, no compile errors, no runtime crashes on first render.
