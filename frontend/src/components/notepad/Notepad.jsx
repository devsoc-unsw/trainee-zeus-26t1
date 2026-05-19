"use client";

import { useEffect, useId, useRef, useState } from "react";
import Window from "@/components/window/Window";
import styles from "./Notepad.module.css";

/* Controlled component: the parent owns `value` and gets `onChange`. Read-only
   call sites can omit `onChange`. */

/* Win7 Notepad icon — small white page with a few blue lines, matches
   what shipped with Windows 7's notepad.exe. */
function NotepadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="np-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#EFEFEF" />
        </linearGradient>
      </defs>
      <rect
        x="4.5" y="3" width="13" height="18"
        rx="0.6"
        fill="url(#np-paper)"
        stroke="#7a8a9a"
        strokeWidth="0.6"
      />
      {/* The little fold on the top-right (very subtle in Win7) */}
      <path d="M14 3 L17.5 6.5 L14 6.5 Z" fill="#EAEAEA" stroke="#7a8a9a" strokeWidth="0.4" />
      {/* Lines of text */}
      <line x1="6.5" y1="9"  x2="15.5" y2="9"  stroke="#3D6FA3" strokeWidth="0.8" />
      <line x1="6.5" y1="11" x2="14.5" y2="11" stroke="#3D6FA3" strokeWidth="0.6" />
      <line x1="6.5" y1="13" x2="15.5" y2="13" stroke="#3D6FA3" strokeWidth="0.6" />
      <line x1="6.5" y1="15" x2="12.5" y2="15" stroke="#3D6FA3" strokeWidth="0.6" />
      <line x1="6.5" y1="17" x2="14"   y2="17" stroke="#3D6FA3" strokeWidth="0.6" />
    </svg>
  );
}

/* Standard Notepad menu items. Pure visual for now. */
function NotepadMenu() {
  return (
    <div className={styles.menu}>
      {["File", "Edit", "Format", "View", "Help"].map((m) => (
        <span key={m} className={styles.menuItem}>
          <span className={styles.menuItemAccel}>{m[0]}</span>
          {m.slice(1)}
        </span>
      ))}
    </div>
  );
}

export default function Notepad({
  fileName = "Untitled",
  value = "",
  onChange,
  placeholder,
  showStatusBar = true,
  readOnly = false,
  x,
  y,
  width = 460,
  height = 540,
  draggable = false,
  zIndex,
  onActivate,
}) {
  const id = useId();
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });
  const ref = useRef(null);

  /* Windows convention — when a file is opened read-only, the application
     appends "[Read Only]" to the document name in the title bar. Word and
     Excel both do this; we follow suit. */
  const titleText = readOnly
    ? `${fileName} [Read Only] - Notepad`
    : `${fileName} - Notepad`;

  const updateCursor = (el) => {
    const idx = el.selectionStart ?? 0;
    const before = el.value.slice(0, idx);
    const ln = before.split("\n").length;
    const lastNewline = before.lastIndexOf("\n");
    const col = idx - (lastNewline + 1) + 1;
    setCursor({ ln, col });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => updateCursor(el);
    el.addEventListener("click", handler);
    el.addEventListener("keyup", handler);
    el.addEventListener("select", handler);
    return () => {
      el.removeEventListener("click", handler);
      el.removeEventListener("keyup", handler);
      el.removeEventListener("select", handler);
    };
  }, []);

  return (
    <Window
      title={titleText}
      icon={<NotepadIcon />}
      menubar={<NotepadMenu />}
      x={x}
      y={y}
      width={width}
      height={height}
      className={styles.notepadWindow}
      draggable={draggable}
      zIndex={zIndex}
      onActivate={onActivate}
    >
      <div className={`${styles.body} ${readOnly ? styles.readOnlyBody : ""}`}>
        <textarea
          id={id}
          ref={ref}
          className={styles.textarea}
          value={value}
          onChange={(e) => {
            if (readOnly) return;
            onChange?.(e.target.value);
            updateCursor(e.currentTarget);
          }}
          placeholder={placeholder}
          spellCheck={!readOnly}
          autoCorrect="off"
          wrap="soft"
          readOnly={readOnly}
          aria-label={`${fileName} text content`}
        />
        {showStatusBar && (
          <div className={styles.statusBar}>
            <span className={styles.statusSpacer} />
            <span className={styles.statusCell}>
              Ln {cursor.ln}, Col {cursor.col}
            </span>
            <span className={styles.statusGrip} aria-hidden />
          </div>
        )}
      </div>
    </Window>
  );
}
