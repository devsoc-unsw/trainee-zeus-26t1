"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import LanguagePicker from "@/components/game/LanguagePicker";
import GameShell from "@/components/game/GameShell";
import { CTLogoMark } from "@/components/brand/CTLogo";
import styles from "./page.module.css";

// Stubbed during Plan 2 migration (Task 1). The real round/lobby state
// and draft persistence will be rewired against the new Realtime
// architecture in later Plan 2/3 tasks.
function useRound() {
  return {
    seed: null,
    roundNum: 1,
    secondsLeft: 180,
    submittedCount: 0,
    totalPlayers: 4,
    hasSubmitted: false,
    submit: async () => {},
  };
}
function useLobby() {
  return { roomId: null };
}
function loadDraft() {
  return null;
}
function saveDraft() {}
function clearDraft() {}

const FALLBACK_STARTER = "# write your solution here\n";
const DEFAULT_PLAYERS = [
  { name: "Jordan", you: false, status: "submitted", statusText: "Submitted" },
  { name: "Amrita", you: false, status: "submitted", statusText: "Submitted" },
  { name: "Lukas", you: false, status: "typing", statusText: "Writing…" },
  { name: "You", you: true, status: "typing", statusText: "Your turn" },
];

export default function EditorPage() {
  const router = useRouter();
  const { roundNum, seed, secondsLeft, submittedCount, totalPlayers, hasSubmitted, submit } =
    useRound();
  const { roomId } = useLobby();

  const starterCode = seed?.starterLine ?? FALLBACK_STARTER;
  const [language, setLanguage] = useState("python");
  const [editorValue, setEditorValue] = useState(starterCode);
  const [lastRoundKey, setLastRoundKey] = useState(null);

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
    router.push("/describe");
  };

  const handleSkip = () => router.push("/describe");

  // Substantive-code heuristic — disables Submit until the player writes more
  // than a single comment line.
  const meaningful =
    editorValue
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("//"))
      .join("\n")
      .trim().length > 6;

  return (
    <Window
      title={`Code Telephone — Round ${roundNum ?? "—"}`}
      subtitle="You're the seed: write any function"
      icon={<CTLogoMark size={14} />}
      width={1280}
      height={720}
      centered
      noPadding
      flush
      onClose={() => router.push("/")}
    >
      <GameShell
        phaseIdx={0}
        players={DEFAULT_PLAYERS}
        seconds={secondsLeft ?? 180}
        readyCount={submittedCount}
        totalPlayers={totalPlayers}
        screenLabel="write any function you want"
        submitDisabled={!meaningful || hasSubmitted}
        submitLabel="Submit →"
        onSubmit={handleSubmit}
        onSkip={handleSkip}
        tip="Clean naming carries meaning further than clever tricks. The AI judge weighs intent, not syntax."
      >
        <div className={styles.write}>
          <div className={styles.seedBar}>
            <div className={styles.seedLeft}>
              <span className={styles.seedTag}>YOU&apos;RE THE SEED</span>
              <h3 className={styles.seedTitle}>Write any function you want.</h3>
              <p className={styles.seedSub}>
                Pick something with a little character — clever names, sneaky one-liners,
                a confusing helper. Whatever it is, it has to make sense to{" "}
                <b>one</b> teammate downstream. The more interesting the seed, the more
                fun the chain.
              </p>
              <div className={styles.seedTips}>
                <span className={styles.seedTip}>✦ Keep it under ~20 lines</span>
                <span className={styles.seedTip}>✦ Variable names matter</span>
                <span className={styles.seedTip}>✦ No external libraries</span>
              </div>
            </div>
            <div className={styles.seedRight}>
              <LanguagePicker
                value={language}
                onChange={setLanguage}
                disabled={hasSubmitted}
                name="editor-language"
              />
            </div>
          </div>

          <div className={styles.editorWrap}>
            <CodeEditor
              value={editorValue}
              onChange={handleEditorChange}
              language={language}
              fileName="solution"
            />
          </div>
        </div>
      </GameShell>
    </Window>
  );
}
