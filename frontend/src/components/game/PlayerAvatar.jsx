import styles from "./PlayerAvatar.module.css";

/* Stable palette — assign by index so the same player always gets the
   same colour across renders. */
const palette = [
  { from: "#E84A4A", to: "#A82020" }, // red
  { from: "#5BB85C", to: "#256A26" }, // green
  { from: "#4A9DE0", to: "#1F5780" }, // blue
  { from: "#E8A030", to: "#9A6010" }, // amber
  { from: "#A66CCB", to: "#5B2D7A" }, // purple
  { from: "#3FB6B6", to: "#185858" }, // teal
];

function pickColors(seed) {
  if (typeof seed === "number") return palette[seed % palette.length];
  let n = 0;
  for (let i = 0; i < (seed ?? "").length; i++) n = (n + seed.charCodeAt(i)) % palette.length;
  return palette[n];
}

export default function PlayerAvatar({ initials, seed, size = 32 }) {
  const { from, to } = pickColors(seed ?? initials);
  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        fontSize: `${Math.round(size * 0.42)}px`,
      }}
    >
      <span className={styles.sheen} aria-hidden />
      <span className={styles.initials}>{initials}</span>
    </span>
  );
}
