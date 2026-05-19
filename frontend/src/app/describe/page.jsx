"use client";

import { useState } from "react";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import Notepad from "@/components/notepad/Notepad";
import PhaseHUD from "@/components/game/PhaseHUD";
import styles from "./page.module.css";
import { useRound } from "@/lib/socket/useRound";

const FALLBACK_CODE = "# waiting for the previous player's code…\n";
const NOTEPAD_PLACEHOLDER = "Describe what this function does in plain English.";

export default function DescribeDemo() {
  const {
    seed,
    secondsLeft,
    submittedCount,
    totalPlayers,
    hasSubmitted,
    submit,
  } = useRound();

  const receivedCode = seed?.receivedContent ?? FALLBACK_CODE;
  // TODO: language is NOT in the round protocol — see editor/page.jsx.
  const language = "python";

  const [description, setDescription] = useState("");
  const [lastReceivedCode, setLastReceivedCode] = useState(receivedCode);

  if (receivedCode !== lastReceivedCode) {
    setLastReceivedCode(receivedCode);
    setDescription("");
  }

  const handleSubmit = () => {
    submit(description).catch((err) =>
      console.error("[describe] submit failed:", err),
    );
  };
  const [topWindow, setTopWindow] = useState("notepad");
  const displayTimer =
    typeof secondsLeft === "number"
      ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
      : "—:—";
  const readyCount = `${submittedCount} of ${totalPlayers || "—"} submitted`;

  return (
    <div className={styles.stage}>
      <PhaseHUD
        phaseIndex={2}
        phaseTotal={4}
        title="Describe the function"
        timer={displayTimer}
        readyCount={readyCount}
        submitLabel="Submit description"
        onSubmit={handleSubmit}
      />

      {/* TODO: PhaseHUD does not currently accept a disabled prop. When wiring
          real submit, add `disabled` to PhaseHUD's submit button and pass
          `disabled={hasSubmitted}` here. */}

      {/* Left: the received code, in our IDE (read-only) */}
      <div className={styles.codeWindow}>
        <Window
          title="mystery.py — Code Telephone"
          x={56}
          y={88}
          width={560}
          height={460}
          zIndex={topWindow === "code" ? 2 : 1}
          onActivate={() => setTopWindow("code")}
          draggable
        >
          <CodeEditor
            value={receivedCode}
            language={language}
            fileName="mystery"
            readOnly
            height={428}
            showStatusBar
          />
        </Window>
      </div>

      {/* Right: a Notepad to write the description in */}
      <div className={styles.notepadWindow}>
        <Notepad
          fileName="Untitled"
          value={description}
          onChange={setDescription}
          placeholder={NOTEPAD_PLACEHOLDER}
          x={640}
          y={88}
          width={440}
          height={460}
          zIndex={topWindow === "notepad" ? 2 : 1}
          onActivate={() => setTopWindow("notepad")}
          draggable
        />
      </div>
    </div>
  );
}
