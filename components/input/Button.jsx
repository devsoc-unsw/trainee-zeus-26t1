import styles from "./Button.module.css";

/* Win7-style button. The rest gradient stays underneath; on hover a
   pale-blue overlay is composited on top below the mid-ledge (matches
   the architecture in button.svg). */
export default function Button({
  variant = "default",
  disabled = false,
  children,
  className = "",
  ...rest
}) {
  const cls = [
    styles.btn,
    variant === "primary" && styles.primary,
    variant === "danger" && styles.danger,
    disabled && styles.disabled,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={cls} disabled={disabled} {...rest}>
      <span className={styles.label}>{children}</span>
    </button>
  );
}
