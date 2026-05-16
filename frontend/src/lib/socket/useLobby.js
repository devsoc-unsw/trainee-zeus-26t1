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
