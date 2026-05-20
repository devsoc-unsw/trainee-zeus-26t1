import styles from "./PlayerAvatar.module.css";

/* Six-hue deterministic palette — same name always gets the same colour. */
const PALETTE = [
  ["#7cb6f5", "#2a6fb5"],
  ["#f5a78c", "#c75032"],
  ["#9fdc8b", "#3c8f4a"],
  ["#f5d27a", "#b97f1a"],
  ["#c9a4f5", "#6b3fa8"],
  ["#7adfd8", "#2a8884"],
];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function initialsFor(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

function colorsFor(seed) {
  if (typeof seed === "number") return PALETTE[Math.abs(seed) % PALETTE.length];
  const s = seed ?? "";
  return PALETTE[hashStr(s) % PALETTE.length];
}

/* Accepts either `name` (preferred — derives initials + seed) or
   explicit `initials` + `seed` for backward compatibility. */
export default function PlayerAvatar({ name, initials, seed, size = 32 }) {
  const finalInitials = initials ?? initialsFor(name);
  const finalSeed = seed ?? name ?? initials ?? "?";
  const [from, to] = colorsFor(finalSeed);
  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        backgroundImage: `linear-gradient(140deg, ${from} 0%, ${to} 100%)`,
        fontSize: `${Math.max(10, Math.round(size * 0.4))}px`,
      }}
      aria-label={name ? `${name}'s avatar` : "Player avatar"}
    >
      <span className={styles.sheen} aria-hidden="true" />
      <span className={styles.initials}>{finalInitials}</span>
    </span>
  );
}
