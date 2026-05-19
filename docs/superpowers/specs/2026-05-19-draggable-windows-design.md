# Draggable Windows on the Describe Phase

**Date:** 2026-05-19
**Status:** Spec
**Scope:** Phase 2 (`/describe`) — make the code editor and notepad windows draggable.

## Goal

On the `/describe` route, the player can drag the code editor window and the notepad window around the desktop by their titlebars, and clicking/dragging a window brings it on top of the other. Behaviour matches the Windows 7 Aero pattern the rest of the UI is faithful to.

## Surface area

Three files change. No new components.

1. `frontend/src/components/window/Window.jsx` — gains drag behaviour and new props.
2. `frontend/src/components/window/Window.module.css` — adds `cursor: grab` on the titlebar drag region and a `.dragging` modifier on the outer window.
3. `frontend/src/app/describe/page.jsx` — holds the "which window is on top" state and passes new props to both windows.

`Notepad.jsx` already forwards `x`/`y`/`width`/`height` to its inner `Window`; it gains three more forwarded props (`draggable`, `zIndex`, `onActivate`) and no logic. `CodeEditor.jsx` is untouched.

## `Window` API additions

```jsx
<Window
  // existing
  title x y width height menubar icon className
  // new
  draggable={false}    // opt-in; default false preserves current behaviour
  zIndex                // optional; number or 'auto' (default)
  onActivate            // optional; called on pointerdown anywhere on the window's outer div
/>
```

- **`draggable`** — when `true`, pointerdown on the titlebar starts a drag. When `false` (default), behaviour is exactly as today; no listeners attached.
- **`zIndex`** — written straight to the outer div's inline style. Default `'auto'`. Lets the parent stack windows without needing a context.
- **`onActivate`** — fires on pointerdown anywhere on the window's outer div (not just the titlebar). Parent uses this to bring a window to front. Optional; without it the window still drags, it just doesn't promote itself.

Internal state: each `Window` owns its own `(x, y)` once `draggable` is true. The `x`/`y` props seed the initial position; subsequent drags update internal state. The parent does not observe position — it only sets the starting layout.

## Drag behaviour

**Handle.** The titlebar (`<div className={styles.titlebar}>`) is the drag handle. Pointerdown there starts a drag unless the event target's `closest('button')` is one of the min/max/close controls — those keep working as buttons.

**Pointer events.** `pointerdown` → `setPointerCapture` on the titlebar → `pointermove` updates `(x, y)` → `pointerup` releases. Pointer capture means the drag doesn't break when the cursor leaves the window, and there are no `window`-level move/up listeners to attach.

**Position math.** On pointerdown, record `{startX, startY, originX, originY}` where `start*` is the cursor at drag start and `origin*` is the window's `(x, y)` at drag start. On pointermove, set `(x, y) = (originX + e.clientX - startX, originY + e.clientY - startY)` and then clamp.

**Clamping (keep titlebar visible).**
- Titlebar height — pulled from the value already used in `Window.module.css` (a CSS custom property if one exists, otherwise the hard-coded value matched at implementation time).
- Superbar height — pulled from the design token in `globals.css` or matched at implementation time.
- Horizontal: at least ~80 px of titlebar stays inside `[0, viewportWidth]`, so the user can always grab it back.
- Vertical: `0 ≤ y ≤ viewportHeight - superbarHeight - titlebarHeight`. The titlebar never disappears under the Superbar or above the top of the desktop.
- On `window` resize, re-clamp the current position. One resize listener per draggable Window, attached on mount, removed on unmount.

**Cursor.** Titlebar (when `draggable`) → `cursor: grab`. While a drag is active, the outer window div gets a `.dragging` class that sets `cursor: grabbing` and `user-select: none` on its descendants, so text isn't accidentally selected during a drag.

**onActivate firing.** Wired with `onPointerDownCapture` on the outer div so it runs before the titlebar drag handler. Idempotent — calling it when the window is already on top is a no-op in the parent.

## `describe/page.jsx` wiring

```jsx
const [topWindow, setTopWindow] = useState("notepad");
// "notepad" or "code" — whichever was most recently activated.
```

Both windows receive:
- `draggable`
- `zIndex={topWindow === "<id>" ? 2 : 1}` (where `<id>` is `"code"` or `"notepad"`)
- `onActivate={() => setTopWindow("<id>")}`

The two outer wrapper `<div>`s currently used for positioning (`styles.codeWindow`, `styles.notepadWindow` in `describe/page.module.css`) can be removed if they were only there for positioning — the Window's own absolute positioning replaces them. Confirm at implementation time before deleting.

Initial layout is unchanged: code window at `(56, 88)`, notepad at `(640, 88)`. Notepad starts on top because the player reads code and writes in the notepad.

## Out of scope

The following are intentionally not part of this work:
- Drag-to-resize (no edge or corner handles).
- Snap-to-edges or Aero Snap maximize.
- Real behaviour for min/max/close buttons — they remain non-functional placeholders.
- Position persistence (no sessionStorage / localStorage).
- A full window manager — only the two-window swap on `/describe`. A general `WindowGroup` context is not built.
- Editor and reimplement pages — the new `Window` props exist, but those routes do not pass `draggable` yet. Trivial to wire later.
- Touch / mobile gestures — pointer events work on stylus and basic touch, but no pinch-to-resize or mobile-specific tweaks.
- Keyboard accessibility for moving windows — no Alt+Space / arrow-key drag.
- Animations or drag momentum — the window follows the cursor 1:1.

## Testing approach

Primary: manual in the browser. Run the dev server, visit `/describe`, confirm:
- Both windows drag from titlebars.
- Clicking min/max/close still triggers the buttons, no drag is started.
- Titlebar stays on the desktop at all four clamp edges, and above the Superbar at the bottom.
- Clicking either window brings it on top of the other.
- Text selection inside the notepad and code editor still works (no accidental drag start when selecting text in the content area).
- Resizing the browser window re-clamps positions so titlebars remain reachable.

No unit tests are added. The project does not have a frontend test harness configured, and the drag logic is heavily DOM/event coupled. If a test harness is added later, the `useDraggable` extraction (see Future work) is the natural seam.

## Future work (after this lands)

- Opt `editor/page.jsx` and `reimplement/page.jsx` into `draggable` with the same two-window swap. The reimplement page mirrors describe (read-only notepad left, editable code right).
- Promote the per-page `topWindow` swap to a `WindowGroup` context when a third window appears (likely the reveal screen).
- Extract drag math into a `useDraggable(ref, { initial, clamp })` hook in `lib/` if a second component needs it.
