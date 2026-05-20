import styles from "./ScoreNumber.module.css";

/**
 * Big score pill used on the reveal screen. Per docs/ui-design.md §3.13.
 *
 * @param {object} props
 * @param {number|null} props.value      - The number to display. `null` → "—".
 * @param {string}      [props.suffix]    - Defaults to "%".
 * @param {string}      [props.subLabel]  - Small caps label below. Defaults
 *                                          to "semantic match". When `value`
 *                                          is null, the sub-label is forced
 *                                          to "Score pending".
 */
export default function ScoreNumber({
  value,
  suffix = "%",
  subLabel = "semantic match",
}) {
  const displayNumber = value === null || value === undefined ? "—" : String(value);
  const displaySub = value === null || value === undefined ? "Score pending" : subLabel;
  const showSuffix = value !== null && value !== undefined;

  return (
    <div className={styles.pill}>
      <span className={styles.row}>
        <span className={styles.number}>{displayNumber}</span>
        {showSuffix && <span className={styles.suffix}>{suffix}</span>}
      </span>
      <span className={styles.subLabel}>{displaySub}</span>
    </div>
  );
}
