"use client";

import Radio from "@/components/input/Radio";
import styles from "./LanguagePicker.module.css";

const LANGUAGES = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "java", label: "Java" },
];

export default function LanguagePicker({
  value = "python",
  onChange,
  disabled = false,
  name = "code-language",
}) {
  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend className={styles.legend}>Language</legend>
      <div className={styles.row} role="radiogroup" aria-label="Programming language">
        {LANGUAGES.map((lang) => (
          <Radio
            key={lang.id}
            name={name}
            value={lang.id}
            label={lang.label}
            checked={value === lang.id}
            disabled={disabled}
            onChange={() => onChange?.(lang.id)}
          />
        ))}
      </div>
    </fieldset>
  );
}
