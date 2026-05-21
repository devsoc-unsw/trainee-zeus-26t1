"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import TextField from "@/components/input/TextField";
import { CTLogoMark } from "@/components/brand/CTLogo";
import { loadNickname, saveNickname } from "@/lib/storage/nickname";
import styles from "./page.module.css";

/* Two-step home wizard with the hybrid design language:
   Step 1 — nickname
   Step 2 — choice cards (Create / Join / Quick play)
   Modal — opened when the user picks Join, collects the room code.

   API calls (POST /api/rooms, POST /api/rooms/[code]/join) are preserved. */

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState("");
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const saved = loadNickname();
    if (saved) setNickname(saved);
  }, []);

  const persistNickname = () => {
    const trimmed = nickname.trim();
    if (trimmed) saveNickname(trimmed);
    return trimmed;
  };

  const createRoom = async () => {
    const name = persistNickname();
    if (!name || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, roundCount: 3 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[wizard] create failed:", err);
        return;
      }
      const { code } = await res.json();
      router.push(`/waiting-room/${code}`);
    } catch (err) {
      console.error("[wizard] create failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const submitJoin = async () => {
    const name = persistNickname();
    if (!name || joining) return;
    const code = joinInput.replace(/^\/?r\//i, "").trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setJoinError(err.message ?? "Could not join that room.");
        return;
      }
      router.push(`/waiting-room/${code}`);
    } catch (err) {
      console.error("[wizard] join failed:", err);
      setJoinError("Network error — please try again.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <Window
      title="Code Telephone"
      subtitle={step === 1 ? "Set up" : "Choose how to play"}
      icon={<CTLogoMark size={14} />}
      width={520}
      height={460}
      centered
    >
      <div className={styles.home}>
        <div className={styles.hero}>
          <div className={styles.heroMark}>
            <CTLogoMark size={44} />
          </div>
          <div>
            <h1 className={styles.title}>Code Telephone</h1>
            <p className={styles.sub}>Pass a function down a chain. See what survives.</p>
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className={styles.field}>
              <TextField
                label="Your nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                placeholder="e.g. Jordan"
                maxLength={20}
                full
                autoFocus
                hint={`${nickname.length}/20`}
              />
            </div>
            <div className={styles.actions}>
              <Button
                variant="primary"
                size="lg"
                full
                onClick={() => nickname.trim() && setStep(2)}
                disabled={!nickname.trim()}
              >
                Continue →
              </Button>
            </div>
            <p className={styles.foot}>
              By continuing you join a public lobby. No account required.
            </p>
          </>
        ) : (
          <>
            <div className={styles.choices}>
              <button type="button" className={styles.choice} onClick={createRoom} disabled={submitting}>
                <span className={styles.choiceIcon} style={{ background: "linear-gradient(135deg,#7cd5ff,#2a7ab8)" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M10 4v12M4 10h12" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <span className={styles.choiceText}>
                  <span className={styles.choiceTitle}>Create room</span>
                  <span className={styles.choiceSub}>Invite friends with a room code</span>
                </span>
              </button>

              <button
                type="button"
                className={styles.choice}
                onClick={() => {
                  setJoinError(null);
                  setJoinModalOpen(true);
                }}
              >
                <span className={styles.choiceIcon} style={{ background: "linear-gradient(135deg,#a8e07f,#3a8f4a)" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M3 10l4 4 10-10"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                </span>
                <span className={styles.choiceText}>
                  <span className={styles.choiceTitle}>Join with code</span>
                  <span className={styles.choiceSub}>Enter a friend&apos;s room code</span>
                </span>
              </button>

              <button
                type="button"
                className={styles.choice}
                disabled
                title="Coming soon"
              >
                <span className={styles.choiceIcon} style={{ background: "linear-gradient(135deg,#ffd16e,#e8a030)" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M11 2L4 12h5l-1 6 7-10h-5z" fill="#fff" />
                  </svg>
                </span>
                <span className={styles.choiceText}>
                  <span className={styles.choiceTitle}>Quick play</span>
                  <span className={styles.choiceSub}>Match with anyone, anywhere</span>
                </span>
              </button>
            </div>

            <div className={styles.nav}>
              <Button variant="ghost" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <span className={styles.signed}>
                Signed in as <b>{nickname}</b>
              </span>
            </div>
          </>
        )}

        {joinModalOpen && (
          <div className={styles.modalOverlay} onClick={() => setJoinModalOpen(false)} role="presentation">
            <div
              className={styles.modal}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="join-title"
            >
              <h2 id="join-title" className={styles.modalTitle}>
                Join with code
              </h2>
              <p className={styles.modalBody}>Enter the room code your host shared.</p>
              <div className={styles.modalField}>
                <TextField
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, 16))}
                  placeholder="ABCD"
                  maxLength={16}
                  full
                  autoFocus
                />
              </div>
              {joinError && <p className={styles.modalError}>{joinError}</p>}
              <div className={styles.modalActions}>
                <Button variant="ghost" onClick={() => setJoinModalOpen(false)} disabled={joining}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={submitJoin} disabled={joining || !joinInput.trim()}>
                  {joining ? "Joining…" : "Join"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Window>
  );
}
