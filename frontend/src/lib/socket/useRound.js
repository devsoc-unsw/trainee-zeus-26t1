// frontend/src/lib/socket/useRound.js
//
// React hook exposing reactive round state + bound submit. Subscribes
// to the singleton client.js, listens for `round:begin`,
// `round:player_submitted`, `round:ended`, `game:reveal`, `game:over`,
// `room:error`.

"use client";

import { useEffect, useRef, useState } from "react";
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
  error: null,
};

/**
 * Subscribe to round state. The page that renders for the current round
 * is determined by `roundType`. `chains` is populated only when
 * `status === "reveal"`.
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
 *   error:          { code: string, message: string } | null,
 *   submit:         (content: string) => Promise<void>,
 *   reset:          () => Promise<void>,
 * }}
 */
export function useRound() {
  const [state, setState] = useState(INITIAL);
  const deadlineRef = useRef(null);

  useEffect(() => {
    const offBegin = on("round:begin", (data) => {
      const timeLimit =
        typeof data?.timeLimit === "number" ? data.timeLimit : null;
      deadlineRef.current =
        timeLimit != null ? Date.now() + timeLimit * 1000 : null;
      setState((prev) => ({
        ...prev,
        status: "active",
        roundNum: data?.roundNum ?? null,
        roundType: data?.roundType ?? null,
        seed: data?.seed ?? null,
        secondsLeft: timeLimit,
        hasSubmitted: false,
        submittedCount: 0,
        chains: null,
        error: null,
      }));
    });

    const offSubmitted = on("round:player_submitted", (data) => {
      setState((prev) => ({
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
    });

    const offEnded = on("round:ended", () => {
      deadlineRef.current = null;
      setState((prev) => ({ ...prev, secondsLeft: null }));
    });

    const offReveal = on("game:reveal", (data) => {
      deadlineRef.current = null;
      setState((prev) => ({
        ...prev,
        status: "reveal",
        chains: Array.isArray(data?.chains) ? data.chains : null,
        secondsLeft: null,
      }));
    });

    const offOver = on("game:over", () => {
      setState((prev) => ({ ...prev, status: "over" }));
    });

    const offError = on("room:error", (data) => {
      setState((prev) => ({
        ...prev,
        error: {
          code: data?.code ?? "ROOM_ERROR",
          message: data?.message ?? "Unknown error",
        },
      }));
    });

    return () => {
      offBegin();
      offSubmitted();
      offEnded();
      offReveal();
      offOver();
      offError();
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (deadlineRef.current == null) return;
      const remaining = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      );
      setState((prev) =>
        prev.secondsLeft === remaining
          ? prev
          : { ...prev, secondsLeft: remaining },
      );
    }, 250);
    return () => clearInterval(id);
  }, []);

  const submit = async (content) => {
    await submitRound(content);
    setState((prev) => ({ ...prev, hasSubmitted: true }));
  };

  const reset = async () => {
    await resetGame();
    deadlineRef.current = null;
    setState(INITIAL);
  };

  return { ...state, submit, reset };
}
