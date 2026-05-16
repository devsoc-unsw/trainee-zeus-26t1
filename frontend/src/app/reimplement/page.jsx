"use client";

import Notepad from "@/components/notepad/Notepad";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import PhaseHUD from "@/components/game/PhaseHUD";
import styles from "./page.module.css";
import { useRound } from "@/lib/socket/useRound";

const FALLBACK_DESCRIPTION = "Waiting for the previous player's description…";

export default function ReimplementDemo() {
  const {
    seed,
    secondsLeft,
    submittedCount,
    totalPlayers,
    hasSubmitted,
    submit,
  } = useRound();

  // TODO: read the CodeEditor's current value to pass to submit().
  //       CodeEditor manages its own state internally; placeholder used.
  const handleSubmit = () => {
    submit("").catch((err) => console.error("[reimplement] submit failed:", err));
  };

  const receivedDescription = seed?.receivedContent ?? FALLBACK_DESCRIPTION;
  const starterCode = ""; // No starter line on rounds > 1 — server sends none.
  // TODO: language is NOT in the round protocol — see editor/page.jsx.
  const language = "python";
  const displayTimer =
    typeof secondsLeft === "number"
      ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
      : "—:—";
  const readyCount = `${submittedCount} of ${totalPlayers || "—"} submitted`;

  return (
    <div className={styles.stage}>
      <PhaseHUD
        phaseIndex={3}
        phaseTotal={4}
        title="Re-implement the function"
        timer={displayTimer}
        readyCount={readyCount}
        submitLabel="Submit code"
        onSubmit={handleSubmit}
      />

      {/* TODO: PhaseHUD does not currently accept a disabled prop. When wiring
          real submit, add `disabled` to PhaseHUD's submit button and pass
          `disabled={hasSubmitted}` here. */}

      {/* Left: the description (read-only Notepad). */}
      <div className={styles.descWindow}>
        <Notepad
          fileName="received"
          initialValue={receivedDescription}
          readOnly
          x={56}
          y={88}
          width={440}
          height={460}
        />
      </div>

      {/* Right: the editor where Player C writes their reconstruction. */}
      <div className={styles.codeWindow}>
        <Window
          title="solution.py — Code Telephone"
          x={520}
          y={88}
          width={580}
          height={460}
        >
          <CodeEditor
            initialCode={starterCode}
            language={language}
            fileName="solution"
            height={428}
            showStatusBar
          />
        </Window>
      </div>
    </div>
  );
}
