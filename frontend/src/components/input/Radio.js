import styles from "./Radio.module.css";

export default function Radio({
  name,
  value,
  checked = false,
  label,
  onChange,
  disabled = false,
}) {
  /* When no handler is provided (static UI), mark the input read-only so
     React doesn't warn about controlled inputs without onChange. */
  const inputProps = onChange
    ? { checked, onChange }
    : { defaultChecked: checked, readOnly: true };

  return (
    <label className={`${styles.row} ${disabled ? styles.disabled : ""}`}>
      <span className={`${styles.outer} ${checked ? styles.checkedOuter : ""}`}>
        <input
          type="radio"
          name={name}
          value={value}
          disabled={disabled}
          className={styles.input}
          {...inputProps}
        />
        {checked && <span className={styles.dot} aria-hidden />}
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </label>
  );
}
