"use client";

import { forwardRef, useId } from "react";
import styles from "./TextField.module.css";

/* Single-line text input. When `label`, `hint`, or `suffix` are
   provided the input is wrapped in a labeled container; otherwise it
   renders as a bare input so existing callers stay drop-in. */
const TextField = forwardRef(function TextField(
  { label, hint, suffix, full = false, className = "", id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp || autoId;
  const hasShell = label || hint || suffix;

  const input = (
    <input
      ref={ref}
      id={id}
      type="text"
      className={styles.input}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      {...rest}
    />
  );

  if (!hasShell) {
    return <span className={`${styles.bare} ${full ? styles.full : ""} ${className}`}>{input}</span>;
  }

  return (
    <div className={`${styles.field} ${full ? styles.full : ""} ${className}`}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.row}>
        {input}
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
});

export default TextField;
