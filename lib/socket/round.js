// frontend/src/lib/socket/round.js
//
// Imperative round-phase actions. Used by the three round pages and
// the reveal screen.
//
// Each action sends one event over the singleton client and awaits
// the matching server reply (or rejects on `room:error`).
// See docs/API.md for the protocol.

import { on, send } from "./client";
import { ensureConnected, getSession } from "./lobby";

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

/**
 * Send `round:submit` for the active round. Resolves once the server
 * broadcasts `round:player_submitted` for this player. Rejects on
 * `room:error` (e.g. "already submitted" or "no active round").
 *
 * @param {string} content - The submission text. For write/reimplement
 *                           rounds this is code; for describe rounds it
 *                           is the plain-English description.
 * @param {string} [language] - `python` | `javascript` | `java` on code rounds.
 * @returns {Promise<void>}
 */
export async function submitRound(content, language) {
  const session = getSession();
  if (!session.playerId) throw new Error("not in a room");
  await ensureConnected();
  const reply = awaitOne(
    "round:player_submitted",
    "room:error",
    (data) => data?.playerId === session.playerId,
  );
  const payload = { content };
  if (language) {
    payload.language = language;
  }
  send("round:submit", payload);
  await reply;
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
  await ensureConnected();
  const reply = awaitOne("game:state", "room:error");
  send("game:sync", { roomId, playerId });
  return reply;
}

/**
 * Send `game:reset` to return the room to lobby after the game has ended.
 * Host only — non-host calls reject with `room:error`. Resolves on the
 * next `room:updated` broadcast.
 *
 * @returns {Promise<void>}
 */
export async function resetGame() {
  await ensureConnected();
  const reply = awaitOne("room:updated", "room:error");
  send("game:reset", {});
  await reply;
}
