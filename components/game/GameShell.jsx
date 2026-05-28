"use client";

import PlayerAvatar from "@/components/game/PlayerAvatar";
import Pill from "@/components/game/Pill";
import Timer from "@/components/game/Timer";
import Button from "@/components/input/Button";
import styles from "./GameShell.module.css";

const PHASES = ["Write", "Describe", "Reimplement"];

function StatusDot({ state }) {
  return <span className={`${styles.dot} ${styles[`dot_${state}`] ?? ""}`} aria-hidden="true" />;
}

function PlayerRail({ players, phaseIdx, tip }) {
  return (
    <aside className={styles.rail}>
      <div className={styles.railSection}>
        <div className={styles.railTitle}>
          Players · {players.length} of {players.length}
        </div>
        <div className={styles.railPlayers}>
          {players.map((p) => (
            <div key={p.name} className={`${styles.railPlayer} ${p.you ? styles.railPlayerYou : ""}`}>
              <PlayerAvatar name={p.name} size={28} />
              <div className={styles.railPlayerInfo}>
                <div className={styles.railPlayerName}>
                  {p.name}
                  {p.you && <span className={styles.railYou}>you</span>}
                </div>
                <div className={styles.railPlayerState}>
                  <StatusDot state={p.status ?? "waiting"} />
                  <span>{p.statusText ?? ""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${styles.railSection} ${styles.railSectionPhases}`}>
        <div className={styles.railTitle}>Round 1 · Phase {phaseIdx + 1} of 3</div>
        <div className={styles.railPhases}>
          {PHASES.map((p, i) => (
            <div
              key={p}
              className={`${styles.railPhase} ${i < phaseIdx ? styles.railPhaseDone : ""} ${i === phaseIdx ? styles.railPhaseActive : ""}`}
            >
              <span className={styles.railPhaseNum}>
                {i < phaseIdx ? (
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                    <path
                      d="M1 4 L3.5 6 L7 2"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className={styles.railPhaseLabel}>{p}</span>
            </div>
          ))}
        </div>
      </div>

      {tip && (
        <div className={`${styles.railSection} ${styles.railSectionTips}`}>
          <div className={styles.railTitle}>Tip</div>
          <div className={styles.railTip}>{tip}</div>
        </div>
      )}
    </aside>
  );
}

export default function GameShell({
  phaseIdx,
  players,
  seconds,
  readyCount,
  totalPlayers,
  screenLabel,
  submitDisabled,
  submitLabel = "Submit →",
  onSubmit,
  onSkip,
  onForceAdvance,
  canForceAdvance,
  tip,
  children,
}) {
  const totals = totalPlayers ?? players.length;
  return (
    <div className={styles.game}>
      <PlayerRail players={players} phaseIdx={phaseIdx} tip={tip} />

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.phase}>
            <Pill tone="active">PHASE {phaseIdx + 1} OF 3</Pill>
            <h2 className={styles.phaseTitle}>
              {PHASES[phaseIdx]}
              {screenLabel && <span className={styles.phaseSub}> — {screenLabel}</span>}
            </h2>
          </div>
          <Timer seconds={seconds} />
        </div>

        <div className={styles.content}>{children}</div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <span className={styles.ready}>
              {readyCount ?? 0} of {totals} ready
            </span>
            <span className={styles.dotSep}>·</span>
            <span>Round auto-submits at 0:00</span>
          </div>
          <div className={styles.footerActions}>
            {onSkip && (
              <Button variant="ghost" onClick={onSkip}>
                Skip turn
              </Button>
            )}
            {canForceAdvance && onForceAdvance && (
              <Button
                variant="ghost"
                onClick={onForceAdvance}
                title="Host only · advance everyone past this phase"
              >
                Skip phase (host)
              </Button>
            )}
            <Button variant="primary" onClick={onSubmit} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
