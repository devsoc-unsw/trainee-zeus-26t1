// frontend/src/lib/socket/round.js
//
// Imperative round-phase actions. Used by the three round pages and
// the reveal screen.
//
// Each action sends one event over the singleton client and awaits
// the matching server reply (or rejects on `room:error`).
// See docs/API.md for the protocol.

/**
 * Send `round:submit` for the active round. Resolves once the server
 * broadcasts `round:player_submitted` for this player. Rejects on
 * `room:error` (e.g. "already submitted" or "no active round").
 *
 * @param {string} content - The submission text. For write/reimplement
 *                           rounds this is code; for describe rounds it
 *                           is the plain-English description.
 * @returns {Promise<void>}
 */
export async function submitRound(content) {
  // TODO: implement
  // - send `round:submit` with {content}
  // - listen once for `round:player_submitted` matching our playerId
  // - reject on `room:error`
  throw new Error("not implemented");
}

/**
 * Send `game:sync` to reattach the current socket to an existing room
 * and player after a reconnect. Resolves with the `game:state` snapshot.
 *
 * @param {string} roomId
 * @param {string} playerId
 * @returns {Promise<{
 *   status: "lobby" | "active" | "over",
 *   roundNum: number,
 *   roundType: "code" | "describe" | null,
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
export async function syncGame(roomId, playerId) {
  // TODO: implement
  throw new Error("not implemented");
}

/**
 * Send `game:reset` to return the room to lobby after the game has ended.
 * Host only — non-host calls reject with `room:error`. Resolves on the
 * next `room:updated` broadcast.
 *
 * @returns {Promise<void>}
 */
export async function resetGame() {
  // TODO: implement
  throw new Error("not implemented");
}
