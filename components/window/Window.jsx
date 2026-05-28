"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Window.module.css";

const TITLEBAR_HEIGHT = 28;
const MIN_TITLEBAR_VISIBLE = 80;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 360;
const VIEWPORT_MARGIN = 8; // breathing room against the wallpaper edge

function viewport() {
  if (typeof window === "undefined") return { vw: 1920, vh: 1080 };
  return { vw: window.innerWidth, vh: window.innerHeight };
}

function clampPos(x, y, width) {
  const { vw, vh } = viewport();
  const w = typeof width === "number" ? width : 320;
  const minX = MIN_TITLEBAR_VISIBLE - w;
  const maxX = vw - MIN_TITLEBAR_VISIBLE;
  const minY = 0;
  const maxY = vh - TITLEBAR_HEIGHT;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

function clampDims(w, h) {
  const { vw, vh } = viewport();
  const maxW = Math.max(0, vw - VIEWPORT_MARGIN * 2);
  const maxH = Math.max(0, vh - VIEWPORT_MARGIN * 2);
  // If the viewport is narrower/shorter than our preferred minimum, the
  // viewport ceiling wins so the window never overflows.
  const minW = Math.min(MIN_WIDTH, maxW);
  const minH = Math.min(MIN_HEIGHT, maxH);
  return {
    w: Math.max(minW, Math.min(maxW, w)),
    h: Math.max(minH, Math.min(maxH, h)),
  };
}

function resolveInitialDims(width, height) {
  const w = typeof width === "number" ? width : 720;
  const h = typeof height === "number" ? height : 520;
  return clampDims(w, h);
}

function resolveCentered(w, h) {
  if (typeof window === "undefined") return { x: 60, y: 60 };
  return {
    x: Math.max(VIEWPORT_MARGIN, Math.round((window.innerWidth - w) / 2)),
    y: Math.max(VIEWPORT_MARGIN, Math.round((window.innerHeight - h) / 2)),
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

  // Internal dims state — width/height props become the *initial* size,
  // clamped to the viewport. The user can grow/shrink via the resize handle.
  const [dims, setDims] = useState(() => resolveInitialDims(width, height));

  const [pos, setPos] = useState(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    if (shouldCenter) return resolveCentered(dims.w, dims.h);
    return { x: x ?? 80, y: y ?? 80 };
  });
  const [mounted, setMounted] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const draggedRef = useRef(false);
  const userResizedRef = useRef(false);
  const dragOrigin = useRef(null);
  const resizeOrigin = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [activeZ, setActiveZ] = useState(0);

  /* Re-resolve initial position on mount so SSR (where window is undefined)
     hands off cleanly to a real client-computed center. */
  useEffect(() => {
    setMounted(true);
    const next = resolveInitialDims(width, height);
    setDims(next);
    if (shouldCenter && !draggedRef.current) {
      setPos(resolveCentered(next.w, next.h));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* On viewport resize: re-clamp dims so the window never exceeds the
     visible area, then re-clamp/re-center position. */
  useEffect(() => {
    const onResize = () => {
      if (maximized) return;
      setDims((d) => clampDims(d.w, d.h));
      if (draggedRef.current) {
        setPos((p) => clampPos(p.x, p.y, dims.w));
      } else if (shouldCenter) {
        setPos(resolveCentered(dims.w, dims.h));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [shouldCenter, maximized, dims.w, dims.h]);

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
    setPos(clampPos(originX + e.clientX - startX, originY + e.clientY - startY, dims.w));
  };

  const handleTitlePointerUp = (e) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragOrigin.current = null;
    setDragging(false);
  };

  const handleResizePointerDown = (e) => {
    if (e.button !== 0) return;
    if (maximized) return;
    e.stopPropagation();
    userResizedRef.current = true;
    resizeOrigin.current = {
      startX: e.clientX,
      startY: e.clientY,
      originW: dims.w,
      originH: dims.h,
    };
    setResizing(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleResizePointerMove = (e) => {
    if (!resizing || !resizeOrigin.current) return;
    const { startX, startY, originW, originH } = resizeOrigin.current;
    const rawW = originW + (e.clientX - startX);
    const rawH = originH + (e.clientY - startY);
    const { vw, vh } = viewport();
    // Also clamp so the right/bottom edge stays inside the viewport from
    // the window's current top-left position.
    const maxFromPosW = vw - pos.x - VIEWPORT_MARGIN;
    const maxFromPosH = vh - pos.y - VIEWPORT_MARGIN;
    const next = clampDims(
      Math.min(rawW, maxFromPosW),
      Math.min(rawH, maxFromPosH),
    );
    setDims(next);
  };

  const handleResizePointerUp = (e) => {
    if (!resizing) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    resizeOrigin.current = null;
    setResizing(false);
  };

  const handleMax = useCallback(() => {
    setMaximized((m) => !m);
    onMax?.();
  }, [onMax]);

  const dynamicStyle = maximized
    ? {
        left: VIEWPORT_MARGIN,
        top: VIEWPORT_MARGIN,
        width: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
        height: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
      }
    : {
        left: pos.x,
        top: pos.y,
        width: `${dims.w}px`,
        height: `${dims.h}px`,
        minHeight: typeof minHeight === "number" ? `${minHeight}px` : minHeight,
      };

  return (
    <div
      className={`${styles.win} ${active ? styles.winActive : ""} ${maximized ? styles.winMax : ""} ${dragging ? styles.dragging : ""} ${resizing ? styles.resizing : ""} ${mounted ? styles.mounted : ""} ${className}`}
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

      {!maximized && (
        <div
          className={styles.resizeHandle}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          role="separator"
          aria-label="Resize window"
        />
      )}
    </div>
  );
}
