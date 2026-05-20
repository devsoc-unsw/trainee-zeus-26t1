"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import LanguagePicker from "@/components/game/LanguagePicker";
import Notepad from "@/components/notepad/Notepad";
import GameShell from "@/components/game/GameShell";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import Pill from "@/components/game/Pill";
import { CTLogoMark } from "@/components/brand/CTLogo";
import styles from "./page.module.css";

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

const FALLBACK_DESCRIPTION = `Takes a string of characters and gives back a new string
with everything in the opposite order. So the last letter
becomes the first, and so on. The input is left as-is —
the function returns a fresh string, doesn't mutate.

Empty strings come back empty. Single characters come back
unchanged. Works on unicode (one code-point per "slot").`;

const DEFAULT_PLAYERS = [
  { name: "Jordan", you: false, status: "submitted", statusText: "Submitted" },
  { name: "Amrita", you: false, status: "submitted", statusText: "Submitted" },
  { name: "Lukas", you: false, status: "submitted", statusText: "Submitted" },
  { name: "You", you: true, status: "typing", statusText: "Your turn" },
];

export default function ReimplementPage() {
  const router = useRouter();
  const { seed, roundNum, secondsLeft, submittedCount, totalPlayers, hasSubmitted, submit } =
    useRound();
  const { roomId } = useLobby();

  const receivedDescription = seed?.receivedContent ?? FALLBACK_DESCRIPTION;
  const [language, setLanguage] = useState("python");
  const [reconstructedCode, setReconstructedCode] = useState("");
  const [lastReceived, setLastReceived] = useState(receivedDescription);

  if (receivedDescription !== lastReceived) {
    setLastReceived(receivedDescription);
    const saved = roomId && roundNum ? loadDraft(roomId, roundNum) : null;
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
    router.push("/reveal");
  };

  const handleSkip = () => router.push("/reveal");

  return (
    <Window
      title={`Code Telephone — Round ${roundNum ?? "—"}`}
      subtitle="Write the function from the description"
      icon={<CTLogoMark size={14} />}
      width={1280}
      height={720}
      centered
      noPadding
      flush
      onClose={() => router.push("/")}
    >
      <GameShell
        phaseIdx={2}
        players={DEFAULT_PLAYERS}
        seconds={secondsLeft ?? 180}
        readyCount={submittedCount}
        totalPlayers={totalPlayers}
        screenLabel="reimplement from the description"
        submitDisabled={reconstructedCode.trim().length < 4 || hasSubmitted}
        submitLabel="Submit code →"
        onSubmit={handleSubmit}
        onSkip={handleSkip}
        tip="Write idiomatic code in whatever language you prefer — the judge normalises across them."
      >
        <div className={styles.split}>
          <section className={styles.pane}>
            <header className={styles.paneHead}>
              <span className={styles.tag}>FROM</span>
              <PlayerAvatar name="Lukas" size={20} />
              <span className={styles.name}>Lukas&apos;s description</span>
              <Pill tone="ghost">read-only</Pill>
            </header>
            <div className={styles.paneBody}>
              <Notepad fileName="Description" value={receivedDescription} readOnly />
            </div>
          </section>

          <section className={styles.pane}>
            <header className={styles.paneHead}>
              <span className={`${styles.tag} ${styles.tagYou}`}>TO</span>
              <PlayerAvatar name="Mei" size={20} />
              <span className={styles.name}>Mei (next player)</span>
              <Pill tone="accent">your turn</Pill>
              <span className={styles.headLang}>
                <LanguagePicker
                  value={language}
                  onChange={setLanguage}
                  label={null}
                  disabled={hasSubmitted}
                  name="reimplement-language"
                />
              </span>
            </header>
            <div className={styles.paneBody}>
              <CodeEditor
                value={reconstructedCode}
                onChange={handleCodeChange}
                language={language}
                fileName="solution"
              />
            </div>
          </section>
        </div>
      </GameShell>
    </Window>
  );
}
