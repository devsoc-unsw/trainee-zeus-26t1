import styles from "./CTLogo.module.css";

/* Code Telephone logo mark — replaces the Win7 Start Orb in the Superbar
   and acts as the favicon-style stamp in window titles. */
export function CTLogoMark({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Code Telephone"
      style={{ display: "block", filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.4))" }}
    >
      <defs>
        <linearGradient id="ctTile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7cd5ff" />
          <stop offset="50%" stopColor="#3a9ac8" />
          <stop offset="100%" stopColor="#1a6b9e" />
        </linearGradient>
        <linearGradient id="ctSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="7"
        fill="url(#ctTile)"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1"
      />
      <rect x="2" y="2" width="28" height="14" rx="6" fill="url(#ctSheen)" />
      <g
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0 0.5)"
      >
        <path d="M 10 10 C 7 10, 7 16, 10 16 C 7 16, 7 22, 10 22" />
        <path d="M 22 10 C 25 10, 25 16, 22 16 C 25 16, 25 22, 22 22" />
        <path d="M 13 19 Q 16 22, 19 19" />
      </g>
    </svg>
  );
}

export function CTLogoLockup({ small = false }) {
  return (
    <span className={styles.lockup}>
      <CTLogoMark size={small ? 18 : 22} />
      <span className={styles.name}>Code Telephone</span>
    </span>
  );
}
