import styles from "./StartOrb.module.css";

/* The Win7 4-pane flag. Slightly skewed to suggest the waving fabric.
   Colors picked to match the genuine Windows 7 logo palette. */
function WinFlag() {
  return (
    <svg
      className={styles.flag}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g transform="translate(2 3) skewY(-8)">
        <rect x="0"  y="0" width="9" height="8" fill="#F25022" />
        <rect x="10" y="0" width="9" height="8" fill="#7FBA00" />
        <rect x="0"  y="9" width="9" height="8" fill="#00A4EF" />
        <rect x="10" y="9" width="9" height="8" fill="#FFB900" />
      </g>
    </svg>
  );
}

export default function StartOrb() {
  return (
    <button className={styles.orbButton} aria-label="Start">
      <span className={styles.outerRing} aria-hidden />
      <span className={styles.body} aria-hidden />
      <span className={styles.shine} aria-hidden />
      <WinFlag />
      <span className={styles.hoverGlow} aria-hidden />
    </button>
  );
}
