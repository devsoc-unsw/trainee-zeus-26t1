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
