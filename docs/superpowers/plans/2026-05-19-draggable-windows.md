# Draggable Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the code editor and notepad windows draggable on `/describe`, with click-to-bring-to-front for the two-window stack.

**Architecture:** Add three new opt-in props to `Window` (`draggable`, `zIndex`, `onActivate`). Each draggable Window owns its own `(x, y)` state, seeded from props. The describe page holds a `topWindow` string and toggles `zIndex` on activation. `Notepad` forwards the three new props straight through to its inner `Window`. Pointer events with `setPointerCapture` drive the drag; clamping keeps the titlebar reachable.

**Tech Stack:** Next.js 16 App Router, plain `.jsx`, CSS Modules. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-19-draggable-windows-design.md`

**Testing note:** The project has no frontend test harness. Verification is manual in the browser via `npm run dev` from `frontend/`. Each task lists a concrete in-browser check.

---

## File Map

- Modify `frontend/src/components/window/Window.jsx` — add `draggable`, `zIndex`, `onActivate`; internal position state; pointer-event handlers; clamping; resize listener.
- Modify `frontend/src/components/window/Window.module.css` — add `.titlebarDraggable` (cursor: grab) and `.dragging` (cursor: grabbing, user-select: none) modifiers.
- Modify `frontend/src/components/notepad/Notepad.jsx` — forward `draggable`, `zIndex`, `onActivate` to inner `Window`.
- Modify `frontend/src/app/describe/page.jsx` — add `topWindow` state, pass new props to both windows.

Do **not** modify:
- `frontend/src/app/describe/page.module.css` — the `.codeWindow` / `.notepadWindow` wrappers run the entry animations; keep them.
- `frontend/src/components/game/CodeEditor.jsx` — unaffected.

---

## Task 1: Add `zIndex` and `onActivate` props to `Window`

**Files:**
- Modify: `frontend/src/components/window/Window.jsx`

- [ ] **Step 1: Add new props and apply zIndex to style**

Edit `frontend/src/components/window/Window.jsx`. Update `positionStyle` to accept and apply `zIndex`, and update the `Window` component signature.

Change the `positionStyle` function (currently lines 59-70):

```jsx
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
```

Change the `Window` component signature and body (currently lines 72-116):

```jsx
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
```

- [ ] **Step 2: Verify nothing visually changes**

Run `npm run dev` from `frontend/`. Visit `/describe`. The page should look identical to before — both windows render in the same positions, all existing behaviour intact.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/window/Window.jsx
git commit -m "feat(window): add zIndex and onActivate props"
```

---

## Task 2: Forward new props through `Notepad`

**Files:**
- Modify: `frontend/src/components/notepad/Notepad.jsx`

- [ ] **Step 1: Add the three forwarded props**

Edit `frontend/src/components/notepad/Notepad.jsx`. Update the `Notepad` component signature (currently lines 54-65) to accept the new props, and pass them through to its inner `Window` (currently lines 101-110).

Update the signature:

```jsx
export default function Notepad({
  fileName = "Untitled",
  value = "",
  onChange,
  placeholder,
  showStatusBar = true,
  readOnly = false,
  x,
  y,
  width = 460,
  height = 540,
  draggable = false,
  zIndex,
  onActivate,
}) {
```

Update the `<Window>` open tag to forward them:

```jsx
    <Window
      title={titleText}
      icon={<NotepadIcon />}
      menubar={<NotepadMenu />}
      x={x}
      y={y}
      width={width}
      height={height}
      className={styles.notepadWindow}
      draggable={draggable}
      zIndex={zIndex}
      onActivate={onActivate}
    >
```

The `draggable` prop is forwarded eagerly so it's ready for Task 5 — `Window` will ignore it until then.

- [ ] **Step 2: Verify nothing changed in the browser**

Visit `/describe`. Notepad still renders, still typeable. No regression expected.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/notepad/Notepad.jsx
git commit -m "feat(notepad): forward draggable/zIndex/onActivate to Window"
```

---

## Task 3: Wire click-to-front on the describe page

**Files:**
- Modify: `frontend/src/app/describe/page.jsx`

- [ ] **Step 1: Add `topWindow` state and pass `zIndex` + `onActivate` to both windows**

Edit `frontend/src/app/describe/page.jsx`. Add the import for `useState` if it's not already a named import (it already is — currently line 3).

Inside the `DescribeDemo` component, after the existing `useState` declarations and before the `return`, add the topWindow state. Replace the current return block to thread the new props through both windows.

Add this just after the `handleSubmit` definition (currently line 40):

```jsx
  const [topWindow, setTopWindow] = useState("notepad");
```

Replace the two `<Window>` / `<Notepad>` blocks in the return (currently lines 64-95). The wrappers stay (they run entry animations); only the inner components change:

```jsx
      {/* Left: the received code, in our IDE (read-only) */}
      <div className={styles.codeWindow}>
        <Window
          title="mystery.py — Code Telephone"
          x={56}
          y={88}
          width={560}
          height={460}
          zIndex={topWindow === "code" ? 2 : 1}
          onActivate={() => setTopWindow("code")}
        >
          <CodeEditor
            value={receivedCode}
            language={language}
            fileName="mystery"
            readOnly
            height={428}
            showStatusBar
          />
        </Window>
      </div>

      {/* Right: a Notepad to write the description in */}
      <div className={styles.notepadWindow}>
        <Notepad
          fileName="Untitled"
          value={description}
          onChange={setDescription}
          placeholder={NOTEPAD_PLACEHOLDER}
          x={640}
          y={88}
          width={440}
          height={460}
          zIndex={topWindow === "notepad" ? 2 : 1}
          onActivate={() => setTopWindow("notepad")}
        />
      </div>
```

Notepad starts on top because that matches the player's natural focus (read code, write description).

- [ ] **Step 2: Verify click-to-front in the browser**

Visit `/describe`. The two windows currently don't overlap (they're side by side), so to verify the stacking works:

1. Open DevTools and select the code window's outer `.window` element. Change its inline `left` to e.g. `400px` so it overlaps the notepad.
2. Notepad should be on top (you can see its right edge over the code window).
3. Click on the code window. It should jump to the front (its right edge now covers the notepad's left edge).
4. Click on the notepad. It jumps back to the front.

Revert the DevTools `left` edit when done. No visual issue if you skip this check now — the next tasks will introduce actual dragging that makes overlap natural.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/describe/page.jsx
git commit -m "feat(describe): bring window to front on click"
```

---

## Task 4: Add titlebar drag cursor styling

**Files:**
- Modify: `frontend/src/components/window/Window.module.css`

- [ ] **Step 1: Add `.titlebarDraggable` and `.dragging` modifier classes**

Edit `frontend/src/components/window/Window.module.css`. Append the following at the end of the file:

```css
/* ── Drag state ────────────────────────────────────────────────────── */
/* Applied to the titlebar when the Window is opted into drag via the
   `draggable` prop. The cursor change is the only visual hint that the
   titlebar is grabbable. The control buttons (.ctrl) override this with
   their own cursor: pointer. */
.titlebarDraggable {
  cursor: grab;
}

/* Applied to the outer `.window` element while a drag is in progress.
   Forces the grabbing cursor everywhere inside and prevents text from
   being selected when the pointer drifts over the content area. */
.dragging,
.dragging * {
  cursor: grabbing !important;
  user-select: none;
}
```

- [ ] **Step 2: Verify nothing changed in the browser**

Visit `/describe`. No visible change — the classes aren't applied yet.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/window/Window.module.css
git commit -m "feat(window): add cursor styling for drag handle"
```

---

## Task 5: Add drag behaviour to `Window` (no clamping yet)

**Files:**
- Modify: `frontend/src/components/window/Window.jsx`

- [ ] **Step 1: Add `draggable` prop, internal position state, pointer handlers**

Edit `frontend/src/components/window/Window.jsx`. This task rewrites most of the file. Replace the entire contents with the following:

```jsx
import { useRef, useState } from "react";
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
   layout (e.g. flex/grid centring) controls placement. When `draggable`
   is on, the live position comes from internal state, not the props. */
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
  draggable = false,
}) {
  const Icon = icon ?? <DefaultWindowIcon />;

  /* Internal position state. Seeded from x/y props on mount. After
     mount the props are ignored — the Window owns its position. Numeric
     x/y are required for drag to work (otherwise the seeded value is
     undefined and the math is meaningless). */
  const [pos, setPos] = useState({
    x: typeof x === "number" ? x : 0,
    y: typeof y === "number" ? y : 0,
  });
  const [dragging, setDragging] = useState(false);

  /* Drag origin: cursor position and window position at the moment of
     pointerdown. Kept in a ref because it does not affect rendering. */
  const dragOrigin = useRef(null);

  const liveX = draggable ? pos.x : x;
  const liveY = draggable ? pos.y : y;

  const handlePointerDown = (e) => {
    if (!draggable) return;
    /* Don't start a drag if the pointer landed on one of the control
       buttons (min/max/close). They keep working as buttons. */
    if (e.target.closest("button")) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!dragging || !dragOrigin.current) return;
    const { startX, startY, originX, originY } = dragOrigin.current;
    const nextX = originX + e.clientX - startX;
    const nextY = originY + e.clientY - startY;
    setPos({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragOrigin.current = null;
    setDragging(false);
  };

  return (
    <div
      className={`${styles.window} ${className} ${dragging ? styles.dragging : ""}`}
      style={positionStyle({ x: liveX, y: liveY, width, height, zIndex })}
      onPointerDownCapture={onActivate}
    >
      <div
        className={`${styles.titlebar} ${draggable ? styles.titlebarDraggable : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
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
```

- [ ] **Step 2: Verify the existing pages still render**

Visit `/`, `/waiting-room`, `/editor`, `/describe`, `/reimplement`. Every existing layout should look identical, because no caller has opted into `draggable` yet.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/window/Window.jsx
git commit -m "feat(window): add opt-in drag behaviour"
```

---

## Task 6: Add clamping and resize handler

**Files:**
- Modify: `frontend/src/components/window/Window.jsx`

- [ ] **Step 1: Add the clamp function and resize listener**

Edit `frontend/src/components/window/Window.jsx`. Add the `useEffect` import to the existing React import at the top of the file:

```jsx
import { useEffect, useRef, useState } from "react";
```

Add the clamp helper at module scope, above `function IconMinimize()`:

```jsx
/* Clamping for drag positions. Keep at least MIN_TITLEBAR_VISIBLE pixels
   of titlebar inside the viewport horizontally, and never let the
   titlebar slip under the Superbar at the bottom or above the top of the
   desktop. The two constants mirror values pinned in the corresponding
   CSS files:
   - TITLEBAR_HEIGHT matches `.titlebar { height: 30px }` in Window.module.css.
   - SUPERBAR_HEIGHT matches `.superbar { height: 40px }` in Superbar.module.css.
   If either is changed, update these too. */
const TITLEBAR_HEIGHT = 30;
const SUPERBAR_HEIGHT = 40;
const MIN_TITLEBAR_VISIBLE = 80;

function clampPosition(x, y, windowWidth) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;

  const w = typeof windowWidth === "number" ? windowWidth : 0;

  /* Horizontal: at least MIN_TITLEBAR_VISIBLE px of titlebar must stay
     inside the viewport on each side. Right edge of window can go to
     vw - MIN_TITLEBAR_VISIBLE; left edge can go down to
     MIN_TITLEBAR_VISIBLE - w. */
  const minX = MIN_TITLEBAR_VISIBLE - w;
  const maxX = vw - MIN_TITLEBAR_VISIBLE;
  const clampedX = Math.min(maxX, Math.max(minX, x));

  /* Vertical: titlebar top can't go above 0 (top of desktop) and the
     titlebar's bottom can't slip under the Superbar. */
  const minY = 0;
  const maxY = vh - SUPERBAR_HEIGHT - TITLEBAR_HEIGHT;
  const clampedY = Math.min(maxY, Math.max(minY, y));

  return { x: clampedX, y: clampedY };
}
```

Inside the `Window` component, after the existing `useState` lines and before `handlePointerDown`, add the resize effect:

```jsx
  /* On viewport resize, re-clamp the current position so the titlebar
     stays reachable. Only meaningful for draggable windows; the listener
     is attached only in that case. */
  useEffect(() => {
    if (!draggable) return;
    const onResize = () => {
      setPos((p) => clampPosition(p.x, p.y, width));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draggable, width]);
```

Update `handlePointerMove` to clamp on every move:

```jsx
  const handlePointerMove = (e) => {
    if (!dragging || !dragOrigin.current) return;
    const { startX, startY, originX, originY } = dragOrigin.current;
    const nextX = originX + e.clientX - startX;
    const nextY = originY + e.clientY - startY;
    setPos(clampPosition(nextX, nextY, width));
  };
```

- [ ] **Step 2: Verify the existing pages still render unchanged**

Visit `/describe`. No visual difference yet (no Window has `draggable={true}` yet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/window/Window.jsx
git commit -m "feat(window): clamp drag position to viewport and superbar"
```

---

## Task 7: Enable drag on the describe page

**Files:**
- Modify: `frontend/src/app/describe/page.jsx`

- [ ] **Step 1: Pass `draggable` to both windows**

Edit `frontend/src/app/describe/page.jsx`. Add `draggable` to both component instances (the two blocks added in Task 3).

In the `<Window>` for the code editor, add `draggable` (alongside the other props):

```jsx
        <Window
          title="mystery.py — Code Telephone"
          x={56}
          y={88}
          width={560}
          height={460}
          zIndex={topWindow === "code" ? 2 : 1}
          onActivate={() => setTopWindow("code")}
          draggable
        >
```

In the `<Notepad>` instance, add `draggable`:

```jsx
        <Notepad
          fileName="Untitled"
          value={description}
          onChange={setDescription}
          placeholder={NOTEPAD_PLACEHOLDER}
          x={640}
          y={88}
          width={440}
          height={460}
          zIndex={topWindow === "notepad" ? 2 : 1}
          onActivate={() => setTopWindow("notepad")}
          draggable
        />
```

- [ ] **Step 2: End-to-end browser walkthrough**

Run `npm run dev` from `frontend/` and visit `/describe`. Confirm each item:

1. **Drag both windows.** Mousedown on either titlebar and move. The window follows the cursor.
2. **Drag from chrome only.** Pressing inside the code editor text area (or notepad textarea) and dragging should NOT move the window — it should select text as normal.
3. **Min/max/close still clickable.** Hover the three control buttons in either titlebar. The hover state appears (background change for min/max, brightness for close). Clicking them does nothing visible (they're placeholders) but doesn't start a drag.
4. **Cursor states.** Hover the titlebar — cursor is `grab`. While dragging — cursor is `grabbing` everywhere on the page. After releasing — cursor returns to `grab` over the titlebar.
5. **Click-to-front.** Drag the code window so it overlaps the notepad. Click on the notepad — it jumps in front. Click on the code window — it jumps in front. Confirm drag also brings to front (mousedown on the back window's titlebar both raises and starts the drag).
6. **Clamping.**
   - Drag a window up — the titlebar stops at the top of the desktop, can't go above.
   - Drag a window down — the titlebar stops just above the Superbar, doesn't slip under.
   - Drag a window left — most of the window goes off-screen, but ~80 px of the titlebar stays visible on the right.
   - Drag a window right — symmetric; ~80 px of the titlebar stays visible on the left.
7. **Window resize re-clamps.** Drag a window to the bottom-right corner, then shrink the browser window. The window's position re-clamps so the titlebar stays reachable.
8. **No accidental text selection.** During a drag that crosses the content area of either window, no text is selected mid-drag and no text remains selected after release.
9. **Other pages unaffected.** Visit `/`, `/waiting-room`, `/editor`, `/reimplement`. Each looks identical to before — no flicker, no positioning change, no console errors.
10. **No console errors or warnings** during any of the above.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/describe/page.jsx
git commit -m "feat(describe): enable drag on code and notepad windows"
```

---

## Spec coverage check

- Spec §"Surface area" → Tasks 1, 2, 3, 4, 5, 6, 7 cover the three files listed plus the Notepad prop forwarding the spec notes as automatic.
- Spec §"`Window` API additions" → Task 1 (`zIndex`, `onActivate`), Task 5 (`draggable`). `x`/`y` seeding behaviour is in Task 5.
- Spec §"Drag behaviour" → Task 5 (pointer events, control-button exclusion, dragging class), Task 6 (clamping math, resize listener), Task 4 (cursors).
- Spec §"`describe/page.jsx` wiring" → Task 3 (topWindow state, zIndex, onActivate), Task 7 (`draggable`).
- Spec §"Out of scope" → No tasks; explicit non-goals.
- Spec §"Testing approach" → Task 7 step 2 is the end-to-end manual walkthrough.

## Future work (deferred per spec)

- Opt `editor/page.jsx` and `reimplement/page.jsx` into `draggable` with the same two-window swap.
- Promote per-page `topWindow` to a `WindowGroup` context when a third window appears.
- Extract drag math into a `useDraggable(ref, { initial, clamp })` hook if a second component needs it.
