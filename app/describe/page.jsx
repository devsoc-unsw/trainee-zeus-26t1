"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import Notepad from "@/components/notepad/Notepad";
import GameShell from "@/components/game/GameShell";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import Pill from "@/components/game/Pill";
import { CTLogoMark } from "@/components/brand/CTLogo";
import styles from "./page.module.css";

// Stubbed during Plan 2 migration. The real round/lobby state and draft
// persistence will be rewired against the new Realtime architecture later.
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

const FALLBACK_CODE = `def reverse_string(s):
    return s[::-1]`;

const DEFAULT_PLAYERS = [
  { name: "Jordan", you: false, status: "submitted", statusText: "Submitted" },
  { name: "Amrita", you: false, status: "submitted", statusText: "Submitted" },
  { name: "Lukas", you: false, status: "typing", statusText: "Writing…" },
  { name: "You", you: true, status: "typing", statusText: "Your turn" },
];

export default function DescribePage() {
  const router = useRouter();
  const { seed, roundNum, secondsLeft, submittedCount, totalPlayers, hasSubmitted, submit } =
    useRound();
  const { roomId } = useLobby();

  const receivedCode = seed?.receivedContent ?? FALLBACK_CODE;
  const language = "python";

  const [description, setDescription] = useState("");
  const [lastReceived, setLastReceived] = useState(receivedCode);

  if (receivedCode !== lastReceived) {
    setLastReceived(receivedCode);
    const saved = roomId && roundNum ? loadDraft(roomId, roundNum) : null;
    setDescription(saved ?? "");
  }

  const handleDescriptionChange = (val) => {
    setDescription(val);
    if (roomId && roundNum) saveDraft(roomId, roundNum, val);
  };

  const handleSubmit = () => {
    submit(description)
      .then(() => clearDraft())
      .catch((err) => console.error("[describe] submit failed:", err));
    router.push("/reimplement");
  };

  const handleSkip = () => router.push("/reimplement");

  return (
    <Window
      title={`Code Telephone — Round ${roundNum ?? "—"}`}
      subtitle="Describe the code in plain English"
      icon={<CTLogoMark size={14} />}
      width={1280}
      height={720}
      centered
      noPadding
      flush
      onClose={() => router.push("/")}
    >
      <GameShell
        phaseIdx={1}
        players={DEFAULT_PLAYERS}
        seconds={secondsLeft ?? 180}
        readyCount={submittedCount}
        totalPlayers={totalPlayers}
        screenLabel="describe what it does"
        submitDisabled={description.trim().length < 8 || hasSubmitted}
        submitLabel="Submit description →"
        onSubmit={handleSubmit}
        onSkip={handleSkip}
        tip="Describe behaviour, not syntax. Mention edge cases — they survive the chain."
      >
        <div className={styles.split}>
          <section className={styles.pane}>
            <header className={styles.paneHead}>
              <span className={styles.tag}>FROM</span>
              <PlayerAvatar name="Amrita" size={20} />
              <span className={styles.name}>Amrita&apos;s code</span>
              <Pill tone="ghost">read-only</Pill>
            </header>
            <div className={styles.paneBody}>
              <CodeEditor value={receivedCode} language={language} fileName="mystery" readOnly />
            </div>
          </section>

          <section className={styles.pane}>
            <header className={styles.paneHead}>
              <span className={`${styles.tag} ${styles.tagYou}`}>TO</span>
              <PlayerAvatar name="Lukas" size={20} />
              <span className={styles.name}>Lukas (next player)</span>
              <Pill tone="accent">your turn</Pill>
            </header>
            <div className={styles.paneBody}>
              <Notepad
                fileName="Description"
                value={description}
                onChange={handleDescriptionChange}
                placeholder="Describe what this function does in plain English…"
              />
            </div>
          </section>
        </div>
      </GameShell>
    </Window>
  );
}
