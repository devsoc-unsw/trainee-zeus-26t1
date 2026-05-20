"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Window.module.css";

const TITLEBAR_HEIGHT = 28;
const SUPERBAR_HEIGHT = 46;
const MENUBAR_HEIGHT = 26;
const MIN_TITLEBAR_VISIBLE = 80;

function clampPos(x, y, width) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
  const w = typeof width === "number" ? width : 320;
  const minX = MIN_TITLEBAR_VISIBLE - w;
  const maxX = vw - MIN_TITLEBAR_VISIBLE;
  const minY = MENUBAR_HEIGHT;
  const maxY = vh - SUPERBAR_HEIGHT - TITLEBAR_HEIGHT;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

function resolveCentered(width, height) {
  if (typeof window === "undefined") return { x: 60, y: 60 };
  const w = typeof width === "number" ? width : 720;
  const h = typeof height === "number" ? height : 480;
  return {
    x: Math.max(8, Math.round((window.innerWidth - w) / 2)),
    y: Math.max(
      MENUBAR_HEIGHT + 4,
      Math.round((window.innerHeight - h - SUPERBAR_HEIGHT) / 2) + MENUBAR_HEIGHT,
    ),
  };
}

/* Window — Win7 Aero title-bar gradient + macOS traffic lights on the LEFT.
   Draggable from the title bar (mouse), double-click to toggle maximize. */
export default function Window({
  title,
  subtitle,
  icon,
  children,
  width = 720,
  height,
  minHeight,
  x,
  y,
  centered,
  active = true,
  toolbar,
  flush = false,
  noPadding = false,
  className = "",
  zIndex,
  onActivate,
  onClose,
  onMin,
  onMax,
  draggable = true,
}) {
  const shouldCenter =
    centered || (x === undefined && y === undefined && typeof window !== "undefined");

  const [pos, setPos] = useState(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    if (shouldCenter) return resolveCentered(width, height);
    return { x: x ?? 80, y: y ?? 80 };
  });
  const [mounted, setMounted] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const draggedRef = useRef(false);
  const dragOrigin = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [activeZ, setActiveZ] = useState(0);

  /* Re-resolve initial position on mount so SSR (where window is undefined)
     hands off cleanly to a real client-computed center. */
  useEffect(() => {
    setMounted(true);
    if (shouldCenter && !draggedRef.current) {
      setPos(resolveCentered(width, height));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Re-center on viewport resize while the user hasn't dragged yet. */
  useEffect(() => {
    const onResize = () => {
      if (maximized) return;
      if (draggedRef.current) {
        setPos((p) => clampPos(p.x, p.y, width));
      } else if (shouldCenter) {
        setPos(resolveCentered(width, height));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [shouldCenter, width, height, maximized]);

  const handleTitlePointerDown = (e) => {
    if (e.target.closest(`.${styles.tl}`)) return;
    if (e.button !== 0) return;
    if (maximized) return;
    if (!draggable) return;
    draggedRef.current = true;
    setActiveZ((z) => z + 1);
    dragOrigin.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleTitlePointerMove = (e) => {
    if (!dragging || !dragOrigin.current) return;
    const { startX, startY, originX, originY } = dragOrigin.current;
    setPos(clampPos(originX + e.clientX - startX, originY + e.clientY - startY, width));
  };

  const handleTitlePointerUp = (e) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragOrigin.current = null;
    setDragging(false);
  };

  const handleMax = useCallback(() => {
    setMaximized((m) => !m);
    onMax?.();
  }, [onMax]);

  const dynamicStyle = maximized
    ? {
        left: 8,
        top: MENUBAR_HEIGHT + 4,
        width: "calc(100vw - 16px)",
        height: `calc(100vh - ${MENUBAR_HEIGHT + SUPERBAR_HEIGHT + 8}px)`,
      }
    : {
        left: pos.x,
        top: pos.y,
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        minHeight: typeof minHeight === "number" ? `${minHeight}px` : minHeight,
      };

  return (
    <div
      className={`${styles.win} ${active ? styles.winActive : ""} ${maximized ? styles.winMax : ""} ${dragging ? styles.dragging : ""} ${mounted ? styles.mounted : ""} ${className}`}
      style={{ ...dynamicStyle, zIndex: zIndex ?? 200 + activeZ }}
      onPointerDownCapture={() => {
        setActiveZ((z) => z + 1);
        onActivate?.();
      }}
    >
      <div
        className={`${styles.titlebar} ${active ? "" : styles.titlebarInactive}`}
        onPointerDown={handleTitlePointerDown}
        onPointerMove={handleTitlePointerMove}
        onPointerUp={handleTitlePointerUp}
        onPointerCancel={handleTitlePointerUp}
        onDoubleClick={handleMax}
      >
        <div className={styles.lights} aria-hidden={!active}>
          <button
            type="button"
            className={`${styles.tl} ${styles.tlClose}`}
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            aria-label="Close window"
          >
            <svg viewBox="0 0 8 8" width="6" height="6" aria-hidden="true">
              <path d="M1 1 L7 7 M7 1 L1 7" stroke="#5a0e0a" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.tl} ${styles.tlMin}`}
            onClick={(e) => {
              e.stopPropagation();
              onMin?.();
            }}
            aria-label="Minimize window"
          >
            <svg viewBox="0 0 8 8" width="6" height="6" aria-hidden="true">
              <path d="M1 4 H7" stroke="#5a3500" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.tl} ${styles.tlMax}`}
            onClick={(e) => {
              e.stopPropagation();
              handleMax();
            }}
            aria-label={maximized ? "Restore window" : "Maximize window"}
          >
            <svg viewBox="0 0 8 8" width="6" height="6" aria-hidden="true">
              <path
                d="M2 6 L2 2 L6 2 M6 2 L2 6"
                stroke="#0c3d10"
                strokeWidth="1.4"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        </div>

        <div className={styles.titleInner}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <span className={styles.titleText}>{title}</span>
          {subtitle && <span className={styles.titleSub}>— {subtitle}</span>}
        </div>

        <span className={styles.titleGlare} aria-hidden="true" />
      </div>

      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}

      <div
        className={`${styles.body} ${flush ? styles.bodyFlush : ""} ${noPadding ? styles.bodyNoPad : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
