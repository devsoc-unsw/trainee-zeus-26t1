import Button from "@/components/input/Button";
import styles from "./PhaseHUD.module.css";

/* Small floating Aero panel that holds the round-level controls
   (phase title + countdown + skip/submit). Sits as a docked HUD on the
   desktop above the windows — it doesn't belong inside any single
   window because the windows are tools and the HUD is the game itself. */
export default function PhaseHUD({
  phaseIndex,
  phaseTotal,
  title,
  timer,
  readyCount,
  onSkip,
  onSubmit,
  submitLabel = "Submit",
}) {
  return (
    <div className={styles.hud}>
      <span className={styles.glare} aria-hidden />

      <div className={styles.section}>
        <div className={styles.phaseLabel}>
          PHASE {phaseIndex} OF {phaseTotal}
        </div>
        <div className={styles.phaseTitle}>{title}</div>
      </div>

      <span className={styles.divider} aria-hidden />

      <div className={styles.section}>
        <div className={styles.timerLabel}>TIME LEFT</div>
        <div className={styles.timerValue}>{timer}</div>
      </div>

      <span className={styles.divider} aria-hidden />

      <div className={styles.actions}>
        {readyCount && <span className={styles.ready}>{readyCount}</span>}
        <Button onClick={onSkip}>Skip</Button>
        <Button variant="primary" onClick={onSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
