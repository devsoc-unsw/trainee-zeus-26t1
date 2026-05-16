// frontend/src/lib/socket/lobby.js
//
// Imperative one-shot lobby actions. Used by the home wizard to fire
// create / join before navigating to /waiting-room.
//
// Each action sends one event and awaits the matching server reply
// (or rejects on `room:error`). See docs/API.md for the protocol.

import { connect, on, send } from "./client";

let lobbyState = {
  code: null,
  roomId: null,
  playerId: null,
  hostId: null,
  roundCount: null,
  players: [],
};

const subscribers = new Set();

function setLobby(patch) {
  lobbyState = { ...lobbyState, ...patch };
  for (const fn of [...subscribers]) {
    try {
      fn(lobbyState);
    } catch (err) {
      console.error("[lobby] subscriber threw:", err);
    }
  }
}

on("room:created", (data) => {
  setLobby({
    code: data?.code ?? null,
    roomId: data?.roomId ?? null,
    playerId: data?.playerId ?? null,
    hostId: data?.playerId ?? null,
    players: data?.players ?? [],
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
  });
});

on("room:updated", (data) => {
  setLobby({
    hostId: data?.hostId ?? lobbyState.hostId,
    players: data?.players ?? [],
  });
});

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

/**
 * Send `room:create`. Resolves with the `room:created` reply payload,
 * or rejects with the `room:error` payload.
 *
 * @param {string} name - player nickname (non-empty)
 * @param {3 | 5} roundCount
 * @returns {Promise<{roomId: string, code: string, playerId: string, players: object[]}>}
 */
export async function createRoom(name, roundCount) {
  await ensureConnected();
  const reply = awaitOne("room:created", "room:error");
  send("room:create", { name, roundCount });
  const data = await reply;
  setLobby({ roundCount });
  return data;
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
  await ensureConnected();
  const reply = awaitOne("room:joined", "room:error");
  send("room:join", { code, name });
  return reply;
}

/**
 * Send `room:leave`. Fire-and-forget — no server reply.
 * @returns {Promise<void>}
 */
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

/**
 * Send `game:start`. Host only. Resolves with the `game:started` reply
 * (or rejects with `room:error` if the caller is not host / too few players).
 *
 * @returns {Promise<{roundCount: number, timeLimits: object}>}
 */
export async function startGame() {
  const reply = awaitOne("game:started", "room:error");
  send("game:start", {});
  return reply;
}

export function getSession() {
  return lobbyState;
}

export function subscribeLobby(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
