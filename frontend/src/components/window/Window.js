import styles from "./Window.module.css";

/* Window control icons rendered as inline SVGs so they stay crisp.
   They sit centred inside the 44×22 control buttons. */
function IconMinimize() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2" y="8" width="8" height="1.5" fill="currentColor" />
    </svg>
  );
}
function IconMaximize() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect
        x="1.5"
        y="2"
        width="9"
        height="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect x="1.5" y="2" width="9" height="1.5" fill="currentColor" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WindowIcon() {
  /* Small Win7-style flag for the title bar app icon */
  return (
    <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
      <g transform="translate(3 5) skewY(-8)">
        <rect x="0"  y="0" width="8" height="7" fill="#F25022" />
        <rect x="9"  y="0" width="8" height="7" fill="#7FBA00" />
        <rect x="0"  y="8" width="8" height="7" fill="#00A4EF" />
        <rect x="9"  y="8" width="8" height="7" fill="#FFB900" />
      </g>
    </svg>
  );
}

export default function Window({ title, children, width, menubar }) {
  return (
    <div
      className={styles.window}
      style={width ? { width: typeof width === "number" ? `${width}px` : width } : undefined}
    >
      <div className={styles.titlebar}>
        <span className={styles.titlebarTopGlare} aria-hidden />
        <span className={styles.titlebarSheen} aria-hidden />

        <div className={styles.titleSlot}>
          <WindowIcon />
          <span className={styles.title}>{title}</span>
        </div>

        <div className={styles.controls}>
          <button className={styles.ctrl} aria-label="Minimize">
            <IconMinimize />
          </button>
          <button className={styles.ctrl} aria-label="Maximize">
            <IconMaximize />
          </button>
          <button className={`${styles.ctrl} ${styles.close}`} aria-label="Close">
            <IconClose />
          </button>
        </div>
      </div>

      {menubar && <div className={styles.menubar}>{menubar}</div>}

      <div className={styles.content}>{children}</div>
    </div>
  );
}
