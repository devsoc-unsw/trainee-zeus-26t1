"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./Notepad.module.css";

/* Notepad-style text panel. Renders as a panel (NOT its own Window) so it
   can sit alongside CodeEditor inside a split-pane game layout.
   Controlled: parent owns `value` and receives `onChange`. */
export default function Notepad({
  fileName = "Description",
  value = "",
  onChange,
  placeholder,
  showStatusBar = true,
  readOnly = false,
  badge = "Plain English",
  className = "",
}) {
  const id = useId();
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });
  const ref = useRef(null);

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

  const chars = value.length;
  const lines = value.split("\n").length;
  const words = value.split(/\s+/).filter(Boolean).length;

  return (
    <div className={`${styles.notepad} ${readOnly ? styles.readOnly : ""} ${className}`}>
      <div className={styles.topBar}>
        <span className={styles.title}>
          {fileName}.txt
          {readOnly ? " — Read Only" : ""}
        </span>
        {badge && <span className={styles.pill}>{badge}</span>}
      </div>

      <div className={styles.body}>
        {readOnly ? (
          <pre className={styles.pre}>{value}</pre>
        ) : (
          <textarea
            id={id}
            ref={ref}
            className={styles.textarea}
            value={value}
            onChange={(e) => {
              onChange?.(e.target.value);
              updateCursor(e.currentTarget);
            }}
            placeholder={placeholder ?? "Describe what this function does in plain English…"}
            spellCheck
            autoCorrect="off"
            wrap="soft"
            aria-label={`${fileName} text content`}
          />
        )}
      </div>

      {showStatusBar && (
        <div className={styles.statusBar}>
          <span>{chars} chars</span>
          <span>·</span>
          <span>
            {words} {words === 1 ? "word" : "words"}
          </span>
          <span className={styles.statusSpacer} />
          <span>
            Ln {cursor.ln}{readOnly ? "" : `, Col ${cursor.col}`} · {lines}{" "}
            {lines === 1 ? "line" : "lines"}
          </span>
        </div>
      )}
    </div>
  );
}
