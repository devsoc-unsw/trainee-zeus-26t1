import styles from "./Window.module.css";

/* Window control icons rendered as inline SVGs so they stay crisp.
   They sit centred inside the 44×22 control buttons. */
function IconMinimize() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2" y="8" width="8" height="1.5" fill="currentColor" />
    </svg>
  );
}
function IconMaximize() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect
        x="1.5"
        y="2"
        width="9"
        height="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect x="1.5" y="2" width="9" height="1.5" fill="currentColor" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DefaultWindowIcon() {
  /* Small Win7-style flag for the title bar app icon */
  return (
    <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
      <g transform="translate(3 5) skewY(-8)">
        <rect x="0"  y="0" width="8" height="7" fill="#F25022" />
        <rect x="9"  y="0" width="8" height="7" fill="#7FBA00" />
        <rect x="0"  y="8" width="8" height="7" fill="#00A4EF" />
        <rect x="9"  y="8" width="8" height="7" fill="#FFB900" />
      </g>
    </svg>
  );
}

/* Build the CSS style block from positioning props. If x/y are provided
   the window is absolutely positioned on the desktop. Otherwise the parent
   layout (e.g. flex/grid centring) controls placement. Later this is
   where mouse-drag state will write back position changes. */
function positionStyle({ x, y, width, height, zIndex }) {
  const px = (v) => (typeof v === "number" ? `${v}px` : v);
  const style = {};
  if (x !== undefined || y !== undefined) {
    style.position = "absolute";
    if (x !== undefined) style.left = px(x);
    if (y !== undefined) style.top = px(y);
  }
  if (width !== undefined) style.width = px(width);
  if (height !== undefined) style.height = px(height);
  if (zIndex !== undefined) style.zIndex = zIndex;
  return Object.keys(style).length > 0 ? style : undefined;
}

export default function Window({
  title,
  children,
  width,
  height,
  x,
  y,
  menubar,
  icon,
  className = "",
  zIndex,
  onActivate,
}) {
  const Icon = icon ?? <DefaultWindowIcon />;
  return (
    <div
      className={`${styles.window} ${className}`}
      style={positionStyle({ x, y, width, height, zIndex })}
      onPointerDownCapture={onActivate}
    >
      <div className={styles.titlebar}>
        <span className={styles.titlebarTopGlare} aria-hidden />
        <span className={styles.titlebarSheen} aria-hidden />

        <div className={styles.titleSlot}>
          <span className={styles.iconWrap}>{Icon}</span>
          <span className={styles.title}>{title}</span>
        </div>

        <div className={styles.controls}>
          <button className={styles.ctrl} aria-label="Minimize">
            <IconMinimize />
          </button>
          <button className={styles.ctrl} aria-label="Maximize">
            <IconMaximize />
          </button>
          <button className={`${styles.ctrl} ${styles.close}`} aria-label="Close">
            <IconClose />
          </button>
        </div>
      </div>

      {menubar && <div className={styles.menubar}>{menubar}</div>}

      <div className={styles.content}>{children}</div>
    </div>
  );
}
