"use client";

import { useEffect, useState } from "react";
import GlassPanel from "@/components/glass/GlassPanel";
import styles from "./ErrorToast.module.css";

// Stubbed during Plan 2 migration (Task 1). This component is currently
// not mounted anywhere — kept for the visual design only. When the new
// Realtime error surface lands (Plan 2/3), wire it up properly.
function useLobby() {
  return { error: null };
}
function useRound() {
  return { error: null };
}

const DISMISS_AFTER_MS = 6000;

export default function ErrorToast() {
  const { error: lobbyError } = useLobby();
  const { error: roundError } = useRound();

  // Single-slot toast. Latest error wins. Object identity of `shown`
  // changes per setShown, which is what the auto-dismiss effect keys on.
  const [shown, setShown] = useState(null);

  // React's "compare-in-render" pattern (https://react.dev/learn/you-might-
  // not-need-an-effect). Storing the previous hook value in state lets us
  // detect changes during render and call setShown without triggering the
  // react-hooks/set-state-in-effect rule. When both hooks change in the
  // same render, the round assignment runs last and wins — same precedence
  // as the original effect-based version. We avoid Date.now() here because
  // it is impure and would trip react-hooks/purity.
  const [lastLobbyError, setLastLobbyError] = useState(null);
  const [lastRoundError, setLastRoundError] = useState(null);

  if (lobbyError !== lastLobbyError) {
    setLastLobbyError(lobbyError);
    if (lobbyError) {
      setShown({ ...lobbyError, source: "lobby" });
    }
  }
  if (roundError !== lastRoundError) {
    setLastRoundError(roundError);
    if (roundError) {
      setShown({ ...roundError, source: "round" });
    }
  }

  useEffect(() => {
    if (!shown) return undefined;
    const t = setTimeout(() => setShown(null), DISMISS_AFTER_MS);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;

  return (
    <div className={styles.toastWrap} role="alert">
      <GlassPanel className={styles.toast}>
        <div className={styles.iconBox} aria-hidden>
          !
        </div>
        <div className={styles.body}>
          <div className={styles.title}>{titleFor(shown.code)}</div>
          <div className={styles.message}>{shown.message}</div>
        </div>
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => setShown(null)}
          aria-label="Dismiss"
        >
          ×
        </button>
      </GlassPanel>
    </div>
  );
}

function titleFor(code) {
  switch (code) {
    case "NAME_TAKEN":
      return "Name taken";
    case "ROOM_NOT_FOUND":
      return "Room not found";
    case "GAME_IN_PROGRESS":
      return "Game already started";
    case "NOT_HOST":
      return "Host only";
    case "TOO_FEW_PLAYERS":
      return "Need more players";
    default:
      return "Error";
  }
}
