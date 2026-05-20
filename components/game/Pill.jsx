import styles from "./Pill.module.css";

/* Pill — small status chip used across the game (PHASE 1 OF 3, READY,
   YOU'RE THE SEED, etc.). Tones: default, accent, done, active, danger,
   ghost. */
export default function Pill({ tone = "default", icon, children, className = "", ...rest }) {
  return (
    <span className={`${styles.pill} ${styles[tone] ?? ""} ${className}`} {...rest}>
      {icon && <span className={styles.icon}>{icon}</span>}
      {children}
    </span>
  );
}
