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
  setLobby({ roundCount, gameStarted: false });
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
  setLobby({ ...INITIAL_STATE });
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
  return store.state;
}

export function subscribeLobby(fn) {
  store.subscribers.add(fn);
  return () => store.subscribers.delete(fn);
}
