"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { highlightToHtml } from "@/lib/highlight";
import styles from "./CodeEditor.module.css";

/* ──────────────────────────────────────────────────────────────────────
   CodeEditor — LeetCode/HackerRank-style editor with Aero chrome.
   Layered:
     1. Highlight layer (rendered <pre> with tokenised spans)
     2. Textarea on top — transparent text, visible caret
     3. Line-number gutter on the left
   Both layers share font + padding so glyphs align perfectly.
   ────────────────────────────────────────────────────────────────────── */

const LANGUAGE_LABEL = {
  python: "Python",
  javascript: "JavaScript",
  java: "Java",
};

const TAB_SPACES = 4;

function indentForNewline(value, caret) {
  /* Pull the indentation from the start of the current line for auto-indent
     on Enter. Also adds +4 spaces after lines ending with ':' or '{'. */
  const before = value.slice(0, caret);
  const lineStart = before.lastIndexOf("\n") + 1;
  const currentLine = before.slice(lineStart);
  const indentMatch = currentLine.match(/^[ \t]*/);
  let indent = indentMatch ? indentMatch[0] : "";
  const trimmed = currentLine.trimEnd();
  if (trimmed.endsWith(":") || trimmed.endsWith("{")) {
    indent += " ".repeat(TAB_SPACES);
  }
  return indent;
}

export default function CodeEditor({
  initialCode = "",
  language = "python",
  readOnly = false,
  fileName = "solution",
  showStatusBar = true,
  height = 360,
}) {
  const [code, setCode] = useState(initialCode);
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });
  const textareaRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);

  const lineCount = useMemo(() => code.split("\n").length, [code]);
  const highlighted = useMemo(
    () => highlightToHtml(code, language),
    [code, language]
  );

  /* Keep scroll positions of the highlight layer + line-number gutter
     synced with the textarea. */
  const onScroll = (e) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  const updateCursor = (el) => {
    const idx = el.selectionStart ?? 0;
    const before = el.value.slice(0, idx);
    const ln = before.split("\n").length;
    const lastNewline = before.lastIndexOf("\n");
    const col = idx - (lastNewline + 1) + 1;
    setCursor({ ln, col });
  };

  const onKeyDown = (e) => {
    if (readOnly) return;
    const el = e.currentTarget;
    /* Tab — insert spaces, do not blur. */
    if (e.key === "Tab") {
      e.preventDefault();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const insert = " ".repeat(TAB_SPACES);
      const next = el.value.slice(0, start) + insert + el.value.slice(end);
      setCode(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + insert.length;
        updateCursor(el);
      });
    }
    /* Enter — auto-indent. */
    if (e.key === "Enter") {
      e.preventDefault();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const indent = indentForNewline(el.value, start);
      const insert = "\n" + indent;
      const next = el.value.slice(0, start) + insert + el.value.slice(end);
      setCode(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + insert.length;
        updateCursor(el);
      });
    }
  };

  /* Run cursor update on selection changes, not just key events. */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const handler = () => updateCursor(el);
    el.addEventListener("select", handler);
    el.addEventListener("click", handler);
    el.addEventListener("keyup", handler);
    return () => {
      el.removeEventListener("select", handler);
      el.removeEventListener("click", handler);
      el.removeEventListener("keyup", handler);
    };
  }, []);

  return (
    <div className={styles.editor} style={{ height }}>
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className={styles.topBar}>
        <span className={styles.langBadge}>
          <span className={styles.langDot} />
          {LANGUAGE_LABEL[language] ?? language}
        </span>
        <span className={styles.fileName}>{fileName}.{language === "python" ? "py" : language === "javascript" ? "js" : "java"}</span>
        <div className={styles.topBarSpacer} />
        <button type="button" className={styles.iconBtn} aria-label="Reset">
          <svg viewBox="0 0 16 16" aria-hidden>
            <path
              d="M8 3 a5 5 0 1 1 -4.9 4 M3 1 L3 5 L7 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button type="button" className={styles.iconBtn} aria-label="Settings">
          <svg viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 1.5 v2 M8 12.5 v2 M1.5 8 h2 M12.5 8 h2 M3.5 3.5 l1.4 1.4 M11.1 11.1 l1.4 1.4 M3.5 12.5 l1.4 -1.4 M11.1 4.9 l1.4 -1.4"
              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── Editor body ─────────────────────────────────────────────── */}
      <div className={styles.body}>
        <div className={styles.gutter} ref={gutterRef} aria-hidden>
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i} className={styles.lineNumber}>{i + 1}</div>
          ))}
        </div>

        <div className={styles.codeArea}>
          <pre
            ref={preRef}
            className={styles.highlight}
            aria-hidden
            dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
          />
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              updateCursor(e.currentTarget);
            }}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            wrap="off"
            readOnly={readOnly}
            aria-label="Code editor"
          />
        </div>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────── */}
      {showStatusBar && (
        <div className={styles.statusBar}>
          <span>Ln {cursor.ln}, Col {cursor.col}</span>
          <span className={styles.statusSep} />
          <span>{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
          <span className={styles.statusSep} />
          <span>{code.length} chars</span>
          <div className={styles.statusSpacer} />
          <span>Spaces: 4</span>
          <span className={styles.statusSep} />
          <span>UTF-8</span>
          <span className={styles.statusSep} />
          <span>{LANGUAGE_LABEL[language] ?? language}</span>
        </div>
      )}
    </div>
  );
}
