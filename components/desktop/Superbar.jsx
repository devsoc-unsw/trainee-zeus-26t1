"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CTLogoMark } from "@/components/brand/CTLogo";
import Clock from "./Clock";
import styles from "./Superbar.module.css";

const TB_ROUTES = [
  { match: (p) => p === "/", id: "home", label: "Code Telephone" },
  { match: (p) => p.startsWith("/waiting-room"), id: "lobby", label: "Waiting Room" },
  { match: (p) => p.startsWith("/editor"), id: "editor", label: "Write phase" },
  { match: (p) => p.startsWith("/describe"), id: "describe", label: "Describe phase" },
  { match: (p) => p.startsWith("/reimplement"), id: "reimplement", label: "Reimplement phase" },
  { match: (p) => p.startsWith("/reveal"), id: "reveal", label: "Reveal" },
];

function PageIconSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={styles.tbGlyph}>
      <rect
        x="1.5"
        y="2"
        width="11"
        height="9"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M3 5h8 M3 7h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export default function Superbar() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  const active = TB_ROUTES.find((r) => r.match(pathname));
  const items = [{ id: "home", label: "Code Telephone", icon: <CTLogoMark size={18} />, href: "/" }];
  if (active && active.id !== "home") {
    items.push({
      id: active.id,
      label: active.label,
      icon: <PageIconSvg />,
      href: pathname,
    });
  }

  return (
    <div className={styles.superbar}>
      <div className={styles.sheen} aria-hidden="true" />
      <Link href="/" className={styles.brand} aria-label="Code Telephone home">
        <CTLogoMark size={22} />
      </Link>
      <div className={styles.sep} aria-hidden="true" />

      <div className={styles.items}>
        {items.map((it) => {
          const isActive = it.id === (active?.id ?? "home");
          return (
            <button
              key={it.id}
              type="button"
              className={`${styles.tbItem} ${isActive ? styles.tbItemActive : ""}`}
              onClick={() => router.push(it.href)}
              title={it.label}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={styles.tbItemIcon}>{it.icon}</span>
              <span className={styles.tbItemLabel}>{it.label}</span>
              {isActive && <span className={styles.tbItemGlow} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className={styles.tray}>
        <button className={styles.trayIcon} title="Notifications" type="button" aria-label="Notifications">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M7 1.5c2 0 3.4 1.4 3.4 3.6v1.7c0 1 .3 1.6 1 2.4H2.6c.7-.8 1-1.4 1-2.4V5.1C3.6 2.9 5 1.5 7 1.5zM5.6 11.4a1.4 1.4 0 002.8 0"
              stroke="currentColor"
              strokeWidth="1.1"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button className={styles.trayIcon} title="Sound" type="button" aria-label="Sound">
          <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
            <path d="M2 5h2.5L7 2v10L4.5 9H2z" fill="currentColor" />
            <path
              d="M9.5 4.5c1 .8 1.6 2 1.6 3.5s-.6 2.7-1.6 3.5"
              stroke="currentColor"
              strokeWidth="1.1"
              fill="none"
            />
          </svg>
        </button>
        <Clock />
        <button
          type="button"
          className={styles.showDesktop}
          title="Show desktop"
          aria-label="Show desktop"
          onClick={() => router.push("/")}
        />
      </div>
    </div>
  );
}
