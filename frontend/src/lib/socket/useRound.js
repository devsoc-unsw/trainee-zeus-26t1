// frontend/src/lib/socket/useRound.js
//
// Shared round state for the whole app. GameRouter (layout) and each phase
// page all call useRound(); they must see the same seed/timer — otherwise a
// page that mounts after round:begin (e.g. /reimplement after round 3) never
// receives the event and shows fallbacks forever.

"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { on } from "./client";
import { resetGame, submitRound } from "./round";

const INITIAL = {
  status: "idle",
  roundNum: null,
  roundType: null,
  seed: null,
  secondsLeft: null,
  hasSubmitted: false,
  submittedCount: 0,
  totalPlayers: 0,
  chains: null,
  scores: null,
  elo: null,
  error: null,
};

/** @type {typeof INITIAL} */
let snapshot = { ...INITIAL };
const listeners = new Set();

/** Shared countdown anchor for the active round (ms since epoch). */
const deadlineRef = { current: null };

function emit() {
  for (const cb of listeners) cb();
}

/**
 * @param {typeof INITIAL | ((prev: typeof INITIAL) => typeof INITIAL)} updater
 */
function setRoundState(updater) {
  const next =
    typeof updater === "function" ? updater(snapshot) : { ...snapshot, ...updater };
  snapshot = next;
  emit();
}

let socketRefCount = 0;
/** @type {Array<() => void>} */
let socketUnsubs = [];

function installSocketHandlers() {
  return [
    on("round:begin", (data) => {
      const timeLimit =
        typeof data?.timeLimit === "number" ? data.timeLimit : null;
      deadlineRef.current =
        timeLimit != null ? Date.now() + timeLimit * 1000 : null;
      setRoundState((prev) => ({
        ...prev,
        status: "active",
        roundNum: data?.roundNum ?? null,
        roundType: data?.roundType ?? null,
        seed: data?.seed ?? null,
        secondsLeft: timeLimit,
        hasSubmitted: false,
        submittedCount: 0,
        chains: null,
        scores: null,
        elo: null,
        error: null,
      }));
    }),

    on("round:player_submitted", (data) => {
      setRoundState((prev) => ({
        ...prev,
        submittedCount:
          typeof data?.totalSubmitted === "number"
            ? data.totalSubmitted
            : prev.submittedCount + 1,
        totalPlayers:
          typeof data?.totalPlayers === "number"
            ? data.totalPlayers
            : prev.totalPlayers,
      }));
    }),

    on("round:ended", () => {
      deadlineRef.current = null;
      setRoundState((prev) => ({ ...prev, secondsLeft: null }));
    }),

    on("game:reveal", (data) => {
      deadlineRef.current = null;
      setRoundState((prev) => ({
        ...prev,
        status: "reveal",
        chains: Array.isArray(data?.chains) ? data.chains : null,
        scores: Array.isArray(data?.scores) ? data.scores : null,
        elo: Array.isArray(data?.elo) ? data.elo : null,
        secondsLeft: null,
      }));
    }),

    on("game:state", (data) => {
      if (Array.isArray(data?.chains) && data.chains.length > 0) {
        deadlineRef.current = null;
        setRoundState((prev) => ({
          ...prev,
          status: data.status === "over" ? "over" : "reveal",
          roundNum: data?.roundNum ?? prev.roundNum,
          roundType: data?.roundType ?? prev.roundType,
          seed: data?.seed ?? prev.seed,
          chains: data.chains,
          scores: Array.isArray(data?.scores) ? data.scores : null,
          elo: Array.isArray(data?.elo) ? data.elo : null,
          secondsLeft:
            typeof data?.timeRemaining === "number"
              ? data.timeRemaining
              : null,
          hasSubmitted: Boolean(data?.submitted),
        }));
        return;
      }
      if (data?.status === "active" && data?.roundNum > 0) {
        const timeRemaining =
          typeof data?.timeRemaining === "number" ? data.timeRemaining : null;
        deadlineRef.current =
          timeRemaining != null ? Date.now() + timeRemaining * 1000 : null;
        setRoundState((prev) => ({
          ...prev,
          status: "active",
          roundNum: data.roundNum,
          roundType: data.roundType ?? null,
          seed: data.seed ?? null,
          secondsLeft: timeRemaining,
          hasSubmitted: Boolean(data.submitted),
          chains: null,
          scores: null,
          elo: null,
        }));
      }
    }),

    on("game:over", () => {
      setRoundState((prev) => ({ ...prev, status: "over" }));
    }),

    on("room:error", (data) => {
      setRoundState((prev) => ({
        ...prev,
        error: {
          code: data?.code ?? "ROOM_ERROR",
          message: data?.message ?? "Unknown error",
        },
      }));
    }),
  ];
}

function subscribe(onStoreChange) {
  listeners.add(onStoreChange);
  if (socketRefCount === 0) {
    socketUnsubs = installSocketHandlers();
  }
  socketRefCount += 1;
  return () => {
    listeners.delete(onStoreChange);
    socketRefCount -= 1;
    if (socketRefCount === 0) {
      for (const u of socketUnsubs) u();
      socketUnsubs = [];
    }
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return INITIAL;
}

/**
 * Subscribe to round state. The page that renders for the current round
 * is determined by `roundType`. `chains` is populated only when
 * `status === "reveal"`.
 *
 * State is shared across all callers (layout GameRouter + phase routes) so
 * navigating after `round:begin` still shows the current seed.
 *
 * @returns {{
 *   status:         "idle" | "lobby" | "active" | "reveal" | "over",
 *   roundNum:       number | null,
 *   roundType:      "code" | "describe" | null,
 *   seed:           {
 *                     promptText?: string | null,
 *                     starterLine?: string | null,
 *                     fromPlayerName?: string | null,
 *                     receivedContent?: string | null,
 *                   } | null,
 *   secondsLeft:    number | null,
 *   hasSubmitted:   boolean,
 *   submittedCount: number,
 *   totalPlayers:   number,
 *   chains:         object[] | null,
 *   scores:         object[] | null,
 *   elo:            object[] | null,
 *   error:          { code: string, message: string } | null,
 *   submit:         (content: string) => Promise<void>,
 *   reset:          () => Promise<void>,
 * }}
 */
export function useRound() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const timerActive = state.secondsLeft != null;

  useEffect(() => {
    if (!timerActive) return undefined;
    const id = setInterval(() => {
      if (deadlineRef.current == null) return;
      const remaining = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      );
      setRoundState((prev) =>
        prev.secondsLeft === remaining
          ? prev
          : { ...prev, secondsLeft: remaining },
      );
    }, 250);
    return () => clearInterval(id);
  }, [timerActive]);

  const submit = useCallback(async (content) => {
    await submitRound(content);
    setRoundState((prev) => ({ ...prev, hasSubmitted: true }));
  }, []);

  const reset = useCallback(async () => {
    await resetGame();
    deadlineRef.current = null;
    setRoundState({ ...INITIAL });
  }, []);

  return { ...state, submit, reset };
}
