// frontend/src/lib/socket/client.js
//
// Singleton WebSocket client for the Code Telephone backend (`/ws/game`).
// See docs/superpowers/specs/2026-05-16-lobby-networking-stubs.md and
// docs/API.md for the protocol.

let socket = null;
let currentStatus = "idle";
let connectingPromise = null;
const handlers = new Map();

function notify(event, data) {
  const list = handlers.get(event);
  if (!list || list.length === 0) return;
  for (const h of [...list]) {
    try {
      h(data);
    } catch (err) {
      console.error(`[socket] handler for ${event} threw:`, err);
    }
  }
}

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
  if (currentStatus === "open" && socket && socket.readyState === WebSocket.OPEN) {
    return;
  }
  if (currentStatus === "connecting" && connectingPromise) {
    return connectingPromise;
  }

  currentStatus = "connecting";
  const ws = new WebSocket(url);
  socket = ws;

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

  ws.addEventListener("message", (ev) => {
    let frame;
    try {
      frame = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!frame || typeof frame.event !== "string") return;
    notify(frame.event, frame.data ?? {});
  });

  ws.addEventListener("close", () => {
    if (socket === ws) socket = null;
    currentStatus = "closed";
    connectingPromise = null;
  });

  return connectingPromise;
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
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify({ event, data: data ?? {} }));
  } catch (err) {
    console.error(`[socket] send ${event} failed:`, err);
  }
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
  let list = handlers.get(event);
  if (!list) {
    list = [];
    handlers.set(event, list);
  }
  list.push(handler);
  return () => {
    const arr = handlers.get(event);
    if (!arr) return;
    const idx = arr.indexOf(handler);
    if (idx >= 0) arr.splice(idx, 1);
  };
}

/**
 * Close the socket and clear all registered handlers.
 */
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

/**
 * @returns {"idle" | "connecting" | "open" | "closed"}
 */
export function status() {
  return currentStatus;
}
