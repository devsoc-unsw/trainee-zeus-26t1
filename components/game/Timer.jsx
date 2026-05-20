import styles from "./Timer.module.css";

function ClockIcon() {
  return (
    <svg className={styles.icon} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 8 L7 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 8 L10 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 1.5 L8.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* Timer pill — shows mm:ss, turns red+pulses under 30s. */
export default function Timer({ seconds, urgent }) {
  const safe = Math.max(0, Math.floor(seconds ?? 0));
  const m = Math.floor(safe / 60);
  const s = (safe % 60).toString().padStart(2, "0");
  const isUrgent = urgent ?? safe <= 30;
  return (
    <div
      className={`${styles.timer} ${isUrgent ? styles.urgent : ""}`}
      role="timer"
      aria-live="off"
      aria-label={`Time remaining: ${m} minutes ${safe % 60} seconds`}
    >
      <ClockIcon />
      <span className={styles.value}>
        {m}:{s}
      </span>
    </div>
  );
}
