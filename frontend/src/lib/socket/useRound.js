// frontend/src/lib/socket/useRound.js
//
// React hook exposing reactive round state + bound submit. Subscribes
// to the singleton client.js, listens for `round:begin`,
// `round:player_submitted`, `round:ended`, `game:reveal`, `game:over`,
// `room:error`.
//
// Stub: returns the default empty shape so pages render. The bound
// `submit` method throws on invocation until implemented.

/**
 * Subscribe to round state. The page that renders for the current round
 * is determined by `roundType`. `chains` is populated only when
 * `status === "reveal"`.
 *
 * @returns {{
 *   // "reveal" and "idle" are client-only states.
 *   // The server's GameStatus is "lobby" | "active" | "over".
 *   status:         "idle" | "lobby" | "active" | "reveal" | "over",
 *   roundNum:       number | null,
 *   // roundType from the server is "code" | "describe" only.
 *   // The frontend uses (roundNum, roundType) together to decide
 *   // which round page renders (editor / describe / reimplement).
 *   roundType:      "code" | "describe" | null,
 *   seed:           {
 *                     promptText?: string | null,    // round 1 only
 *                     starterLine?: string | null,    // round 1 only
 *                     fromPlayerName?: string | null, // rounds > 1
 *                     receivedContent?: string | null,// rounds > 1 — previous player's submission
 *                   } | null,
 *   secondsLeft:    number | null,
 *   hasSubmitted:   boolean,
 *   submittedCount: number,
 *   totalPlayers:   number,
 *   chains:         object[] | null,
 *   error:          { code: string, message: string } | null,
 *   submit:         (content: string) => Promise<void>,
 * }}
 */
export function useRound() {
  // TODO: implement
  // - subscribe to client.on("round:begin", ...) etc. via useEffect
  // - hold reactive state with useState or useSyncExternalStore
  // - drive a setInterval for secondsLeft countdown
  // - bind submit to round.submitRound
  //
  // Returning the default empty shape so the round pages render during
  // the stub phase. Once implemented, the bound submit should also stop
  // throwing on invocation.
  return {
    status: "idle",
    roundNum: null,
    roundType: null,
    seed: null,
    secondsLeft: null,
    hasSubmitted: false,
    submittedCount: 0,
    totalPlayers: 0,
    chains: null,
    error: null,
    submit: async (_content) => {
      throw new Error("not implemented");
    },
  };
}
