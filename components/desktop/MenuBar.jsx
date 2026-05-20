"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { CTLogoMark } from "@/components/brand/CTLogo";
import { useTheme } from "@/components/theme/ThemeProvider";
import styles from "./MenuBar.module.css";

const ROUTE_LABELS = [
  { test: (p) => p === "/", label: "Home" },
  { test: (p) => p.startsWith("/waiting-room"), label: "Waiting Room" },
  { test: (p) => p.startsWith("/editor"), label: "Write phase" },
  { test: (p) => p.startsWith("/describe"), label: "Describe phase" },
  { test: (p) => p.startsWith("/reimplement"), label: "Reimplement phase" },
  { test: (p) => p.startsWith("/reveal"), label: "Reveal" },
];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");
  const h12 = ((now.getHours() + 11) % 12) + 1;
  const ampm = now.getHours() < 12 ? "AM" : "PM";
  return {
    timeShort: `${h12}:${pad(now.getMinutes())} ${ampm}`,
    dateShort: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(-2)}`,
    full: now.toLocaleString(),
  };
}

export default function MenuBar() {
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [openMenu, setOpenMenu] = useState(null);
  const ref = useRef(null);
  const clock = useClock();

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpenMenu(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const screenLabel =
    ROUTE_LABELS.find((r) => r.test(pathname))?.label ?? "Code Telephone";

  const go = (href) => () => {
    setOpenMenu(null);
    router.push(href);
  };

  const menus = [
    {
      id: "app",
      label: "Code Telephone",
      bold: true,
      items: [
        { label: "About Code Telephone" },
        "---",
        { label: "Preferences…", meta: "⌘," },
        "---",
        {
          label: "Toggle Light / Dark",
          meta: theme === "dark" ? "☾" : "☀",
          onClick: toggle,
        },
      ],
    },
    {
      id: "file",
      label: "File",
      items: [
        { label: "New Game", meta: "⌘N", onClick: go("/") },
        { label: "Join with Code…", meta: "⌘J", onClick: go("/") },
        "---",
        { label: "Leave Room", onClick: go("/") },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      items: [
        { label: "Undo", meta: "⌘Z" },
        { label: "Redo", meta: "⇧⌘Z" },
        "---",
        { label: "Cut", meta: "⌘X" },
        { label: "Copy", meta: "⌘C" },
        { label: "Paste", meta: "⌘V" },
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        { label: "Home", onClick: go("/") },
        { label: "Write Phase", onClick: go("/editor") },
        { label: "Describe Phase", onClick: go("/describe") },
        { label: "Reimplement", onClick: go("/reimplement") },
        { label: "Reveal", onClick: go("/reveal") },
      ],
    },
    {
      id: "help",
      label: "Help",
      items: [
        { label: "Game Rules" },
        { label: "Keyboard Shortcuts" },
        "---",
        { label: "Open Documentation" },
      ],
    },
  ];

  return (
    <nav className={styles.menubar} ref={ref} aria-label="Application menu">
      <div className={styles.left}>
        <Link href="/" className={styles.brand} aria-label="Home">
          <CTLogoMark size={16} />
        </Link>
        {menus.map((m) => (
          <div key={m.id} className={styles.itemWrap}>
            <button
              type="button"
              className={`${styles.item} ${openMenu === m.id ? styles.itemOpen : ""} ${m.bold ? styles.itemBold : ""}`}
              onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
              onMouseEnter={() => openMenu !== null && setOpenMenu(m.id)}
              aria-haspopup="menu"
              aria-expanded={openMenu === m.id}
            >
              {m.label}
            </button>
            {openMenu === m.id && (
              <div className={styles.dropdown} role="menu">
                {m.items.map((item, j) =>
                  item === "---" ? (
                    <div className={styles.sep} key={j} role="separator" />
                  ) : (
                    <button
                      type="button"
                      key={j}
                      role="menuitem"
                      className={styles.menuitem}
                      onClick={() => {
                        setOpenMenu(null);
                        item.onClick?.();
                      }}
                    >
                      <span>{item.label}</span>
                      {item.meta ? <span className={styles.meta}>{item.meta}</span> : null}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.center}>
        {screenLabel && <span className={styles.breadcrumb}>{screenLabel}</span>}
      </div>

      <div className={styles.right}>
        <span className={styles.sys} title="Battery 92%" aria-label="Battery 92%">
          <svg width="22" height="11" viewBox="0 0 22 11" aria-hidden="true">
            <rect
              x="0.5"
              y="0.5"
              width="18"
              height="10"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.85"
            />
            <rect x="2" y="2" width="14" height="7" fill="currentColor" opacity="0.85" />
            <rect x="19" y="3" width="2" height="5" rx="0.5" fill="currentColor" opacity="0.85" />
          </svg>
          <span className={styles.sysText}>92%</span>
        </span>
        <span className={styles.sys} title="Wi-Fi" aria-label="Wi-Fi">
          <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
            <path d="M8 11.5a1 1 0 100-2 1 1 0 000 2z" fill="currentColor" />
            <path d="M3 6.5a7 7 0 0110 0" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M5 8a5 5 0 016 0" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M0.5 4.5a10 10 0 0115 0" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.7" />
          </svg>
        </span>
        <button
          type="button"
          className={`${styles.sys} ${styles.sysBtn}`}
          onClick={toggle}
          title="Toggle light / dark"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M10.5 8.5A4.5 4.5 0 015.5 3.5 5 5 0 1010.5 8.5z" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="2.6" fill="currentColor" />
              <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                <line x1="7" y1="1" x2="7" y2="2.5" />
                <line x1="7" y1="11.5" x2="7" y2="13" />
                <line x1="1" y1="7" x2="2.5" y2="7" />
                <line x1="11.5" y1="7" x2="13" y2="7" />
                <line x1="2.5" y1="2.5" x2="3.6" y2="3.6" />
                <line x1="10.4" y1="10.4" x2="11.5" y2="11.5" />
                <line x1="2.5" y1="11.5" x2="3.6" y2="10.4" />
                <line x1="10.4" y1="3.6" x2="11.5" y2="2.5" />
              </g>
            </svg>
          )}
        </button>
        <span className={styles.clock} title={clock.full}>
          {clock.timeShort}
        </span>
      </div>
    </nav>
  );
}
