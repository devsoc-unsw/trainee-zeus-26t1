"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import Radio from "@/components/input/Radio";
import TextField from "@/components/input/TextField";
import { createRoom, joinRoom } from "@/lib/socket/lobby";
import { loadNickname, saveNickname } from "@/lib/socket/session";
import styles from "./page.module.css";

/* The home screen is a classic Win7 wizard:
   - Banner header with title + subtitle
   - White content area with form controls
   - Footer with Back / Next / Cancel right-aligned

   Two steps:
   1. Pick a nickname
   2. Choose how to play (Create / Join / Quick play)
*/

const TOTAL_STEPS = 2;

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState("");
  const [method, setMethod] = useState("create");
  const [joinInput, setJoinInput] = useState("");

  // Pre-fill the nickname on mount from localStorage. Done in an effect
  // (not a lazy useState initializer) to avoid an SSR/CSR hydration
  // mismatch — the server has no access to localStorage.
  useEffect(() => {
    const saved = loadNickname();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setNickname(saved);
  }, []);

  const canAdvance =
    step === 1
      ? nickname.trim().length > 0
      : method === "join"
        ? joinInput.trim().length > 0
        : true;

  const isLast = step === TOTAL_STEPS;

  const handleNext = async () => {
    if (!canAdvance) return;
    if (!isLast) {
      setStep(step + 1);
      return;
    }

    // TODO: surface errors to the user (room:error → toast or inline message).
    //       For now, errors bubble up and reach the console only.
    try {
      if (method === "create") {
        await createRoom(nickname, /* roundCount */ 3);
      } else if (method === "join") {
        await joinRoom(joinInput, nickname);
      } else {
        // TODO: quick play — backend has no matchmake endpoint yet.
      }
      router.push("/waiting-room");
    } catch (err) {
      // TODO: render the error somewhere the user can see it.
      console.error("[wizard] lobby action failed:", err);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className={styles.stage}>
      <Window title="Welcome to Code Telephone" width={540} height={420}>
        <div className={styles.wizard}>
          {/* ── Banner ───────────────────────────────────────────── */}
          <div className={styles.banner}>
            <h2 className={styles.bannerTitle}>
              {step === 1
                ? "Welcome to Code Telephone"
                : "How would you like to play?"}
            </h2>
            <p className={styles.bannerSubtitle}>
              {step === 1
                ? "Pick a nickname to get started."
                : "Choose one of the options below, then click Finish."}
            </p>
          </div>

          {/* ── Content ──────────────────────────────────────────── */}
          <div className={styles.content}>
            {step === 1 && <NicknameStep value={nickname} onChange={setNickname} />}
            {step === 2 && (
              <MethodStep
                method={method}
                onMethodChange={setMethod}
                joinInput={joinInput}
                onJoinInputChange={setJoinInput}
              />
            )}
          </div>

          {/* ── Footer ───────────────────────────────────────────── */}
          <div className={styles.footer}>
            <span className={styles.stepIndicator}>
              Step {step} of {TOTAL_STEPS}
            </span>
            <span className={styles.flex} />
            <Button disabled={step === 1} onClick={handleBack}>
              {"< Back"}
            </Button>
            <Button
              variant="primary"
              disabled={!canAdvance}
              onClick={handleNext}
            >
              {isLast ? "Finish" : "Next >"}
            </Button>
            <Button>Cancel</Button>
          </div>
        </div>
      </Window>
    </div>
  );
}

/* ── Step 1: nickname ─────────────────────────────────────────────── */
function NicknameStep({ value, onChange }) {
  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    saveNickname(v);
  };
  return (
    <div className={styles.stepBody}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Your nickname:</span>
        <TextField
          value={value}
          onChange={handleChange}
          placeholder="e.g. Jordan"
          maxLength={20}
          autoFocus
        />
      </label>
      <p className={styles.hint}>
        This is how other players will see you in the chain. You can use up to
        20 characters.
      </p>
    </div>
  );
}

/* ── Step 2: choose method ────────────────────────────────────────── */
function MethodStep({ method, onMethodChange, joinInput, onJoinInputChange }) {
  return (
    <div className={styles.stepBody}>
      <div className={styles.option}>
        <Radio
          name="method"
          value="create"
          label="Create a new room"
          checked={method === "create"}
          onChange={() => onMethodChange("create")}
        />
        <p className={styles.optionHint}>
          You&apos;ll be the host. Other players join with the room code you
          share.
        </p>
      </div>

      <div className={styles.option}>
        <Radio
          name="method"
          value="join"
          label="Join an existing room"
          checked={method === "join"}
          onChange={() => onMethodChange("join")}
        />
        <p className={styles.optionHint}>
          Enter the room code your host gave you, or paste an invite link.
        </p>
        <div
          className={`${styles.joinRow} ${method === "join" ? "" : styles.disabled}`}
        >
          <span className={styles.joinLabel}>Code or link:</span>
          <TextField
            value={joinInput}
            onChange={(e) => onJoinInputChange(e.target.value)}
            placeholder="ROOM-0000  or  /r/ROOM-0000"
            disabled={method !== "join"}
            maxLength={64}
          />
        </div>
      </div>

      <div className={styles.option}>
        <Radio
          name="method"
          value="quick"
          label="Quick play"
          checked={method === "quick"}
          onChange={() => onMethodChange("quick")}
        />
        <p className={styles.optionHint}>
          Get matched with random players who are looking for a game right now.
        </p>
      </div>
    </div>
  );
}
