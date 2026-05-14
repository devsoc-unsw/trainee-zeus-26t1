import styles from "./Checkbox.module.css";

function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" className={styles.mark} aria-hidden="true">
      <path
        d="M2 6.5 L4.8 9 L10 3.5"
        fill="none"
        stroke="var(--check-mark)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Indeterminate() {
  return (
    <span className={styles.indeterminate} aria-hidden="true" />
  );
}

export default function Checkbox({ state = "none", label, onClick, disabled }) {
  return (
    <label className={`${styles.row} ${disabled ? styles.disabled : ""}`}>
      <span className={styles.box}>
        <input
          type="checkbox"
          className={styles.input}
          checked={state === "checked"}
          readOnly
          disabled={disabled}
          onClick={onClick}
          aria-checked={
            state === "indeterminate" ? "mixed" : state === "checked"
          }
        />
        {state === "checked" && <CheckMark />}
        {state === "indeterminate" && <Indeterminate />}
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </label>
  );
}
