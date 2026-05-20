import styles from "./GlassPanel.module.css";

/* A translucent Aero glass surface. Used for inset panels inside windows
   (e.g. the player list, the language selector). */
export default function GlassPanel({ children, className = "", tinted = false, ...rest }) {
  return (
    <div
      className={`${styles.panel} ${tinted ? styles.tinted : ""} ${className}`}
      {...rest}
    >
      <span className={styles.sheen} aria-hidden />
      <span className={styles.sheenMirror} aria-hidden />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
