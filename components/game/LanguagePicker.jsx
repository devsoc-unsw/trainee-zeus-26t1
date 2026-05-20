"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LANGS, langByAlias } from "@/lib/languages";
import styles from "./LanguagePicker.module.css";

// Document is undefined on the server; `mounted` lets us hold off rendering
// the portal until the client takes over.

/* Popover language picker — twelve options laid out in a 2-column grid.
   The popover is portaled to <body> so it can escape any ancestor
   overflow:hidden / stacking context (game windows clip otherwise). */
export default function LanguagePicker({
  value = "python",
  onChange,
  label = "Your language",
  disabled = false,
  name,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 320 });
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only flip used to gate the body portal
    setMounted(true);
  }, []);

  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const popW = 320;
    const popH = 360;
    let left = r.right - popW;
    left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow > popH + 12 || r.top < popH + 12 ? r.bottom + 6 : r.top - popH - 6;
    setCoords({ top, left, width: popW });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onDoc = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  const current = langByAlias(value);

  const popover =
    open &&
    mounted &&
    createPortal(
      <div
        className={styles.popover}
        ref={popoverRef}
        style={{ top: coords.top, left: coords.left, width: coords.width }}
        role="listbox"
        aria-label="Choose programming language"
      >
        <div className={styles.popoverHead}>Choose language</div>
        <div className={styles.grid}>
          {LANGS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              className={`${styles.opt} ${value === opt.value ? styles.optActive : ""}`}
              onClick={() => {
                onChange?.(opt.value);
                setOpen(false);
              }}
            >
              <span className={styles.optGlyph} style={{ color: opt.color }}>
                {opt.glyph}
              </span>
              <span className={styles.optName}>{opt.label}</span>
              {value === opt.value && (
                <svg className={styles.optCheck} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path
                    d="M1 5 L4 8 L9 2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>,
      document.body,
    );

  return (
    <div className={`${styles.picker} ${open ? styles.pickerOpen : ""}`}>
      {label && <span className={styles.label}>{label}</span>}
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        name={name}
      >
        <span className={styles.triggerGlyph} style={{ color: current.color }}>
          {current.glyph}
        </span>
        <span className={styles.triggerName}>{current.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" className={styles.triggerChev} aria-hidden="true">
          <path d="M1 1 L5 5 L9 1" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {popover}
    </div>
  );
}
