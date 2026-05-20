import styles from "./Checkbox.module.css";

function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" className={styles.mark} aria-hidden="true">
      <path
        d="M2 6 L5 9 L10 3"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Indeterminate() {
  return <span className={styles.indeterminate} aria-hidden="true" />;
}

/* Two APIs supported:
   - boolean `checked` + `onChange(next)` (redesign style)
   - tri-state `state="checked"|"none"|"indeterminate"` + `onClick` (legacy)
   Callers should pass exactly one of these shapes. */
export default function Checkbox({
  checked,
  onChange,
  state,
  onClick,
  label,
  disabled = false,
}) {
  const effective = state !== undefined ? state : checked ? "checked" : "none";
  const isChecked = effective === "checked";

  const handleClick = (e) => {
    if (disabled) return;
    if (onChange) onChange(!isChecked);
    if (onClick) onClick(e);
  };

  return (
    <label className={`${styles.row} ${disabled ? styles.disabled : ""}`}>
      <span className={`${styles.box} ${isChecked ? styles.boxChecked : ""}`}>
        <input
          type="checkbox"
          className={styles.input}
          checked={isChecked}
          disabled={disabled}
          onChange={handleClick}
          aria-checked={effective === "indeterminate" ? "mixed" : isChecked}
        />
        {effective === "checked" && <CheckMark />}
        {effective === "indeterminate" && <Indeterminate />}
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </label>
  );
}
