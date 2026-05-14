import styles from "./TaskbarItem.module.css";

/* Tiny SVG icons for our pinned apps — replace with real artwork later. */
const icons = {
  ct: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="ct-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#6abce8" />
          <stop offset="55%" stopColor="#2a7ab8" />
          <stop offset="100%" stopColor="#1a6b9e" />
        </linearGradient>
      </defs>
      <rect x="2" y="3" width="20" height="16" rx="2" fill="url(#ct-grad)" stroke="#0d4a73" strokeWidth="1" />
      <rect x="2" y="3" width="20" height="4" fill="rgba(255,255,255,0.35)" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontFamily="Segoe UI, Tahoma, sans-serif" fontWeight="700" fill="white">CT</text>
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="fold-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FCD974" />
          <stop offset="100%" stopColor="#E8A030" />
        </linearGradient>
      </defs>
      <path d="M2 7 L10 7 L12 5 L22 5 L22 19 L2 19 Z" fill="url(#fold-grad)" stroke="#8B6010" strokeWidth="0.7" />
      <path d="M2 9 L22 9 L22 19 L2 19 Z" fill="rgba(255,255,255,0.18)" />
    </svg>
  ),
  ie: (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="ie-grad" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%"  stopColor="#6ec8f5" />
          <stop offset="55%" stopColor="#2a7ab8" />
          <stop offset="100%" stopColor="#0d4a73" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#ie-grad)" stroke="#072a4a" strokeWidth="0.7" />
      <path d="M5 12 Q12 5 19 12 Q12 19 5 12 Z" fill="none" stroke="#FFD700" strokeWidth="1.4" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="9" fontFamily="serif" fontWeight="700" fill="#FFD700" fontStyle="italic">e</text>
    </svg>
  ),
};

export default function TaskbarItem({ label, icon, active }) {
  return (
    <button
      className={`${styles.item} ${active ? styles.active : ""}`}
      aria-label={label}
      aria-pressed={active ? "true" : "false"}
    >
      <span className={styles.iconWrap}>{icons[icon] ?? null}</span>
      {active && <span className={styles.underglow} aria-hidden />}
    </button>
  );
}
