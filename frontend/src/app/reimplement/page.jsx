"use client";

import { useState } from "react";
import Notepad from "@/components/notepad/Notepad";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import LanguagePicker from "@/components/game/LanguagePicker";
import PhaseHUD from "@/components/game/PhaseHUD";
import styles from "./page.module.css";
import { useRound } from "@/lib/socket/useRound";
import { useLobby } from "@/lib/socket/useLobby";
import { clearDraft, loadDraft, saveDraft } from "@/lib/socket/session";

const FALLBACK_DESCRIPTION = "Waiting for the previous player's description…";

export default function ReimplementDemo() {
  const {
    roundNum,
    seed,
    secondsLeft,
    submittedCount,
    totalPlayers,
    hasSubmitted,
    submit,
  } = useRound();
  const { roomId } = useLobby();

  const receivedDescription = seed?.receivedContent ?? FALLBACK_DESCRIPTION;

  const [language, setLanguage] = useState("python");
  const [reconstructedCode, setReconstructedCode] = useState("");
  const [lastReceivedDescription, setLastReceivedDescription] =
    useState(receivedDescription);

  // When the seed flips to a new round's description, restore the draft for
  // that (roomId, roundNum) if one was saved, otherwise start blank.
  if (receivedDescription !== lastReceivedDescription) {
    setLastReceivedDescription(receivedDescription);
    const saved =
      roomId && roundNum ? loadDraft(roomId, roundNum) : null;
    setReconstructedCode(saved ?? "");
  }

  const handleCodeChange = (val) => {
    setReconstructedCode(val);
    if (roomId && roundNum) saveDraft(roomId, roundNum, val);
  };

  const handleSubmit = () => {
    submit(reconstructedCode, language)
      .then(() => clearDraft())
      .catch((err) => console.error("[reimplement] submit failed:", err));
  };

  const solutionExt =
    language === "javascript" ? "js" : language === "java" ? "java" : "py";
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
          value={receivedDescription}
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
          title={`solution.${solutionExt} — Code Telephone`}
          x={520}
          y={88}
          width={580}
          height={460}
        >
          <LanguagePicker
            value={language}
            onChange={setLanguage}
            disabled={hasSubmitted}
            name="reimplement-language"
          />
          <CodeEditor
            value={reconstructedCode}
            onChange={handleCodeChange}
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
