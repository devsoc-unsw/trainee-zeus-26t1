"use client";

import { useId, useState } from "react";
import styles from "./TextArea.module.css";

/* Aero-styled textarea with optional label, right-aligned badge, and a
   character counter that turns red past `maxCount`. */
export default function TextArea({
  label,
  badge,
  placeholder,
  rows = 6,
  maxCount,
  initialValue = "",
  className = "",
  ...rest
}) {
  const id = useId();
  const [value, setValue] = useState(initialValue);

  const showCounter = typeof maxCount === "number";
  const over = showCounter && value.length > maxCount;

  return (
    <div className={`${styles.field} ${className}`}>
      {(label || badge) && (
        <div className={styles.labelRow}>
          {label && (
            <label htmlFor={id} className={styles.label}>
              {label}
            </label>
          )}
          {badge && <span className={styles.badge}>{badge}</span>}
        </div>
      )}

      <div className={styles.surface}>
        <textarea
          id={id}
          className={styles.textarea}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck
          {...rest}
        />
      </div>

      {showCounter && (
        <div className={`${styles.counter} ${over ? styles.over : ""}`}>
          {value.length} / {maxCount} characters
        </div>
      )}
    </div>
  );
}
