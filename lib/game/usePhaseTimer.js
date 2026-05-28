"use client";

import { useEffect, useState } from "react";

/**
 * Computes remaining seconds for the active phase, ticking every second.
 *
 * The server stamps rooms.phase_started_at whenever the phase advances
 * (see sql/015_phase_started_at.sql). Clients then compute remaining =
 * max(0, durationSeconds - (now - phase_started_at)) and re-render at 1Hz.
 *
 * Returns null when phase_started_at isn't available yet (e.g. while the
 * useRoom hook is still loading) so the Timer component can show "—".
 */
export function usePhaseTimer(phaseStartedAt, durationSeconds = 180) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!phaseStartedAt) {
      setSecondsLeft(null);
      return;
    }
    const startedAt = new Date(phaseStartedAt).getTime();
    if (Number.isNaN(startedAt)) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const elapsedMs = Date.now() - startedAt;
      setSecondsLeft(Math.max(0, durationSeconds - Math.floor(elapsedMs / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phaseStartedAt, durationSeconds]);

  return secondsLeft;
}
