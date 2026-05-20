import styles from "./Button.module.css";

/* Hybrid button — Win7 Aero metallic surface with Tahoe radius.
   The rest gradient stays underneath; on hover a pale-blue overlay is
   composited on top below the mid-ledge (preserved from the SVG). */
export default function Button({
  variant = "default",
  size = "md",
  full = false,
  disabled = false,
  icon,
  children,
  className = "",
  type = "button",
  ...rest
}) {
  const cls = [
    styles.btn,
    variant === "primary" && styles.primary,
    variant === "danger" && styles.danger,
    variant === "ghost" && styles.ghost,
    size === "sm" && styles.sm,
    size === "lg" && styles.lg,
    full && styles.full,
    disabled && styles.disabled,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={cls} disabled={disabled} type={type} {...rest}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{children}</span>
    </button>
  );
}
