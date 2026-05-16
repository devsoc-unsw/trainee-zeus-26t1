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
