"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import styles from "./Bliss.module.css";

/* Bliss-style rolling-hill wallpaper. Pure SVG, no external assets.
   Tints automatically in dark mode via the same CSS variables the
   tokens expose (--sky-*, --hill-*). */
export default function Bliss() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return (
    <div className={styles.wallpaper} aria-hidden="true">
      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, display: "block" }}
      >
        <defs>
          <linearGradient id="ctSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sky-top)" />
            <stop offset="55%" stopColor="var(--sky-mid)" />
            <stop offset="100%" stopColor="var(--sky-bottom)" />
          </linearGradient>

          <radialGradient id="ctSun" cx="78%" cy="22%" r="42%">
            <stop offset="0%" stopColor={dark ? "#34547f" : "#fff8d8"} stopOpacity={dark ? 0.55 : 0.85} />
            <stop offset="40%" stopColor={dark ? "#1c3559" : "#fff0b0"} stopOpacity={dark ? 0.2 : 0.3} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="ctHill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--hill-light)" />
            <stop offset="35%" stopColor="var(--hill-mid)" />
            <stop offset="100%" stopColor="var(--hill-dark)" />
          </linearGradient>

          <linearGradient id="ctCrest" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={dark ? "#244e2e" : "#bee06e"} stopOpacity="0.95" />
            <stop offset="100%" stopColor={dark ? "#244e2e" : "#bee06e"} stopOpacity="0" />
          </linearGradient>

          <radialGradient id="ctCloud" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={dark ? 0.18 : 0.95} />
            <stop offset="55%" stopColor="#ffffff" stopOpacity={dark ? 0.08 : 0.55} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <pattern id="ctGrass" patternUnits="userSpaceOnUse" width="6" height="6">
            <rect width="6" height="6" fill="transparent" />
            <circle cx="1" cy="1" r="0.5" fill={dark ? "#0c2811" : "#487d20"} opacity="0.35" />
            <circle cx="4" cy="3" r="0.5" fill={dark ? "#1a3a22" : "#7fc14a"} opacity="0.3" />
            <circle cx="2" cy="5" r="0.4" fill={dark ? "#0c2811" : "#3d6a18"} opacity="0.3" />
          </pattern>

          <clipPath id="ctHillClip">
            <path d="M -50 720 C 180 640, 420 600, 700 612 C 980 624, 1180 656, 1380 700 C 1500 726, 1620 736, 1650 738 L 1650 1010 L -50 1010 Z" />
          </clipPath>

          <radialGradient id="ctVignette" cx="50%" cy="55%" r="80%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="1" />
          </radialGradient>
        </defs>

        <rect width="1600" height="1000" fill="url(#ctSky)" />
        <rect width="1600" height="1000" fill="url(#ctSun)" />

        <g opacity={dark ? 0.6 : 1}>
          <g transform="translate(180 180) scale(1.3 0.6)">
            <ellipse cx="0" cy="0" rx="120" ry="80" fill="url(#ctCloud)" />
            <ellipse cx="120" cy="20" rx="80" ry="55" fill="url(#ctCloud)" />
            <ellipse cx="-90" cy="22" rx="70" ry="48" fill="url(#ctCloud)" />
          </g>
          <g transform="translate(620 130) scale(1.0 0.55)">
            <ellipse cx="0" cy="0" rx="90" ry="60" fill="url(#ctCloud)" />
            <ellipse cx="80" cy="14" rx="60" ry="40" fill="url(#ctCloud)" />
            <ellipse cx="-70" cy="18" rx="50" ry="32" fill="url(#ctCloud)" />
          </g>
          <g transform="translate(1180 90) scale(1.4 0.55)">
            <ellipse cx="0" cy="0" rx="110" ry="65" fill="url(#ctCloud)" />
            <ellipse cx="110" cy="22" rx="70" ry="42" fill="url(#ctCloud)" />
            <ellipse cx="-90" cy="20" rx="60" ry="38" fill="url(#ctCloud)" />
          </g>
          <g transform="translate(360 420) scale(1.1 0.4)">
            <ellipse cx="0" cy="0" rx="120" ry="40" fill="url(#ctCloud)" opacity="0.65" />
          </g>
          <g transform="translate(1320 470) scale(1.2 0.4)">
            <ellipse cx="0" cy="0" rx="130" ry="44" fill="url(#ctCloud)" opacity="0.55" />
          </g>
          <g transform="translate(820 480) scale(1.0 0.35)">
            <ellipse cx="0" cy="0" rx="100" ry="34" fill="url(#ctCloud)" opacity="0.5" />
          </g>
        </g>

        <g clipPath="url(#ctHillClip)">
          <rect width="1600" height="1000" fill="url(#ctHill)" />
          <rect width="1600" height="1000" fill="url(#ctGrass)" />
          <path
            d="M -50 720 C 180 640, 420 600, 700 612 C 980 624, 1180 656, 1380 700 C 1500 726, 1620 736, 1650 738 L 1650 770 L -50 770 Z"
            fill="url(#ctCrest)"
            opacity="0.6"
          />
          <rect x="-50" y="880" width="1700" height="200" fill={dark ? "#08200d" : "#1f4a12"} opacity="0.35" />
          <g opacity={dark ? 0.1 : 0.2}>
            <path d="M 200 760 Q 220 820 240 880" stroke={dark ? "#1a3a22" : "#9bd247"} strokeWidth="2" fill="none" />
            <path d="M 480 770 Q 500 830 520 890" stroke={dark ? "#1a3a22" : "#9bd247"} strokeWidth="2" fill="none" />
            <path d="M 760 762 Q 780 820 800 880" stroke={dark ? "#1a3a22" : "#9bd247"} strokeWidth="2" fill="none" />
            <path d="M 1040 770 Q 1060 830 1080 890" stroke={dark ? "#1a3a22" : "#9bd247"} strokeWidth="2" fill="none" />
            <path d="M 1320 778 Q 1340 838 1360 898" stroke={dark ? "#1a3a22" : "#9bd247"} strokeWidth="2" fill="none" />
          </g>
        </g>

        <path
          d="M -50 720 C 180 640, 420 600, 700 612 C 980 624, 1180 656, 1380 700 C 1500 726, 1620 736, 1650 738"
          stroke={dark ? "rgba(120,200,160,0.20)" : "rgba(255,255,200,0.55)"}
          strokeWidth="2"
          fill="none"
        />
        <rect width="1600" height="1000" fill="url(#ctVignette)" opacity={dark ? 0.5 : 0.2} />
      </svg>
    </div>
  );
}
