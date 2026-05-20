"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { highlightToHtml } from "@/lib/highlight";
import { langByAlias } from "@/lib/languages";
import styles from "./CodeEditor.module.css";

/* CodeEditor — dark IDE inside light Aero chrome.
   Three layers stacked vertically:
     1. Top bar  — filename + language pill + read-only badge
     2. Body     — gutter + highlight <pre> + transparent <textarea>
     3. Status   — Ln/Col, char count, encoding/spacing
*/

const TAB_SPACES = 4;

function indentForNewline(value, caret) {
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
  value = "",
  onChange,
  language = "python",
  readOnly = false,
  fileName = "solution",
  showStatusBar = true,
  height,
  className = "",
}) {
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });
  const textareaRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);

  const lang = langByAlias(language);
  const lineCount = useMemo(() => value.split("\n").length, [value]);
  const highlighted = useMemo(() => highlightToHtml(value, lang.value), [value, lang.value]);

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
    if (e.key === "Tab") {
      e.preventDefault();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const insert = " ".repeat(TAB_SPACES);
      const next = el.value.slice(0, start) + insert + el.value.slice(end);
      onChange?.(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + insert.length;
        updateCursor(el);
      });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const indent = indentForNewline(el.value, start);
      const insert = "\n" + indent;
      const next = el.value.slice(0, start) + insert + el.value.slice(end);
      onChange?.(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + insert.length;
        updateCursor(el);
      });
    }
  };

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

  const containerStyle = height ? { height } : undefined;

  return (
    <div className={`${styles.editor} ${className}`} style={containerStyle}>
      <div className={styles.topBar}>
        <span className={styles.fileName}>
          {fileName}.{lang.ext}
        </span>
        <span
          className={styles.langPill}
          style={{
            background: lang.color + "22",
            color: lang.color,
            borderColor: lang.color + "55",
          }}
        >
          <span className={styles.langGlyph}>{lang.glyph}</span>
          {lang.label}
        </span>
        {readOnly && <span className={styles.readOnlyBadge}>READ ONLY</span>}
      </div>

      <div className={styles.body}>
        <div className={styles.gutter} ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i} className={styles.lineNumber}>
              {i + 1}
            </div>
          ))}
        </div>

        <div className={styles.codeArea}>
          <pre
            ref={preRef}
            className={styles.highlight}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
          />
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={value}
            onChange={(e) => {
              if (readOnly) return;
              onChange?.(e.target.value);
              updateCursor(e.currentTarget);
            }}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            wrap="off"
            readOnly={readOnly}
            aria-label={`${fileName} code editor`}
          />
        </div>
      </div>

      {showStatusBar && (
        <div className={styles.statusBar}>
          <span>
            Ln {cursor.ln}, Col {cursor.col}
          </span>
          <span>
            {value.length} chars · {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
          <span className={styles.statusSpacer} />
          <span>UTF-8 · LF · spaces: 4</span>
        </div>
      )}
    </div>
  );
}
