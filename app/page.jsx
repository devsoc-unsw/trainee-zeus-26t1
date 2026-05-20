"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import Radio from "@/components/input/Radio";
import TextField from "@/components/input/TextField";
import { loadNickname, saveNickname } from "@/lib/storage/nickname";
import styles from "./page.module.css";

/* The home screen is a classic Win7 wizard:
   - Banner header with title + subtitle
   - White content area with form controls
   - Footer with Back / Next / Cancel right-aligned

   Two steps:
   1. Pick a nickname
   2. Choose how to play (Create / Join)
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

    saveNickname(nickname.trim());

    try {
      if (method === "create") {
        const res = await fetch("/api/rooms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: nickname.trim(), roundCount: 3 }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("[wizard] create failed:", err);
          return;
        }
        const { code } = await res.json();
        router.push(`/waiting-room/${code}`);
      } else if (method === "join") {
        const code = joinInput.replace(/^\/?r\//i, "").trim().toUpperCase();
        const res = await fetch(`/api/rooms/${code}/join`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: nickname.trim() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("[wizard] join failed:", err);
          return;
        }
        router.push(`/waiting-room/${code}`);
      }
    } catch (err) {
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

    </div>
  );
}
