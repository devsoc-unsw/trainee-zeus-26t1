"use client";

import { useState } from "react";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import LanguagePicker from "@/components/game/LanguagePicker";
import Button from "@/components/input/Button";
import styles from "./page.module.css";
import { useRound } from "@/lib/socket/useRound";
import { useLobby } from "@/lib/socket/useLobby";
import { clearDraft, loadDraft, saveDraft } from "@/lib/socket/session";

const FALLBACK_PROMPT = "Waiting for prompt…";
const FALLBACK_STARTER = "# write your solution here\n";

export default function EditorDemo() {
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

  const promptText = seed?.promptText ?? FALLBACK_PROMPT;
  const starterCode = seed?.starterLine ?? FALLBACK_STARTER;
  // TODO: language is NOT in the round protocol — picked at lobby creation
  //       in the UI but not yet on the wire. Hardcoded for now.
  const [language, setLanguage] = useState("python");

  const [editorValue, setEditorValue] = useState(starterCode);
  const [lastRoundKey, setLastRoundKey] = useState(null);

  // Compare-in-render: when (roomId, roundNum) first becomes available or
  // changes to a new round, prefer a saved draft over the starter line.
  // loadDraft returns null when the stored key doesn't match, so a stale
  // draft never bleeds into a new round.
  const roundKey = roomId && roundNum ? `${roomId}:${roundNum}` : null;
  if (roundKey && roundKey !== lastRoundKey) {
    setLastRoundKey(roundKey);
    const saved = loadDraft(roomId, roundNum);
    setEditorValue(saved ?? starterCode);
  }

  const handleEditorChange = (val) => {
    setEditorValue(val);
    if (roomId && roundNum) saveDraft(roomId, roundNum, val);
  };

  const handleSubmit = () => {
    submit(editorValue)
      .then(() => clearDraft())
      .catch((err) => console.error("[editor] submit failed:", err));
  };
  const displayTimer =
    typeof secondsLeft === "number"
      ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
      : "—:—";
  const readyCount = `${submittedCount} of ${totalPlayers || "—"} submitted`;

  return (
    <div className={styles.stage}>
      <Window
        title={`Code Telephone — Round ${roundNum ?? "—"} — Write Phase`}
        width={920}
        menubar={
          <div className={styles.menu}>
            <span>File</span><span>Edit</span><span>View</span><span>Help</span>
          </div>
        }
      >
        <div className={styles.body}>
          <header className={styles.phaseHeader}>
            <div>
              <div className={styles.phaseLabel}>Phase 1 of 4</div>
              <div className={styles.phaseTitle}>Write the function</div>
            </div>
            <div className={styles.timer}>
              <span className={styles.timerLabel}>Time left</span>
              <span className={styles.timerValue}>{displayTimer}</span>
            </div>
          </header>

          <section className={styles.prompt}>
            <div className={styles.promptLabel}>Prompt</div>
            <p className={styles.promptText}>{promptText}</p>
          </section>

          <div className={styles.editorWrap}>
            <LanguagePicker
              value={language}
              onChange={setLanguage}
              disabled={hasSubmitted}
              name="editor-language"
            />
            <CodeEditor
              value={editorValue}
              onChange={handleEditorChange}
              language={language}
              fileName="solution"
              height={380}
            />
          </div>

          <footer className={styles.actions}>
            <Button>Skip</Button>
            <span className={styles.flex} />
            <span className={styles.readyCount}>{readyCount}</span>
            <Button variant="primary" disabled={hasSubmitted} onClick={handleSubmit}>
              Submit
            </Button>
          </footer>
        </div>
      </Window>
    </div>
  );
}
