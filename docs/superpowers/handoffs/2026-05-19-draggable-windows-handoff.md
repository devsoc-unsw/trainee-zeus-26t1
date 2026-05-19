# Handoff — Draggable Windows on Describe Phase

**Date:** 2026-05-19
**Branch:** `feat/draggable-windows` (7 commits, not pushed)
**Base:** `main` @ `2b4512a`
**Head:** `6c2a7bb`
**Status:** Implementation complete; manual browser verification still pending.

## What this delivers

On `/describe`, the player can:
- Drag the code-editor window and the notepad window by their titlebars.
- Click either window to bring it to the front; the active window also rises during a drag.
- The titlebar always stays reachable — clamped at the top of the desktop, above the Superbar, and ≥ 80 px stays visible on the left/right edges.
- Window resize re-clamps positions so nothing gets stranded off-screen.

Min/max/close buttons remain non-functional placeholders. Drag is opt-in on the `Window` component, so `/`, `/waiting-room`, `/editor`, and `/reimplement` are unaffected.

## Files touched

- `frontend/src/components/window/Window.jsx` — new props (`draggable`, `zIndex`, `onActivate`), pointer-event drag, clamping, resize listener.
- `frontend/src/components/window/Window.module.css` — added `.titlebarDraggable` (`cursor: grab`) and `.dragging` (`cursor: grabbing`, `user-select: none`) classes.
- `frontend/src/components/notepad/Notepad.jsx` — forwards `draggable`/`zIndex`/`onActivate` to its inner `Window`.
- `frontend/src/app/describe/page.jsx` — `topWindow` state + `zIndex`/`onActivate` wiring + `draggable` opt-in on both windows.

## How to try it

```sh
cd frontend
npm run dev
```

Then open `http://localhost:3000/describe` and drag the windows.

## Verification checklist

The plan calls for a manual browser walkthrough (no test harness exists for the frontend). Steps:

1. **Both windows drag from their titlebars.**
2. **Drag handle excludes controls.** Hover and click the min/max/close buttons — hover states fire, no drag starts.
3. **Drag handle excludes content.** Selecting text inside the code editor or notepad does not move the window.
4. **Cursor states.** Titlebar shows `grab`; during drag `grabbing` is applied everywhere.
5. **Click-to-front.** Drag the code window so it overlaps the notepad. Clicking either brings it to front; mousedown on the back window's titlebar both raises it and starts a drag.
6. **Clamping.**
   - Drag up — titlebar stops at the top of the desktop.
   - Drag down — titlebar stops above the Superbar (40 px clearance).
   - Drag left/right — ≥ 80 px of titlebar stays visible on the opposite side.
7. **Resize re-clamps.** Drag a window into the bottom-right corner, then shrink the browser window. The window snaps back into the new clamp box.
8. **Other routes unchanged.** Visit `/`, `/waiting-room`, `/editor`, `/reimplement` — every layout looks identical, no console errors.
9. **No console errors.**

## Known follow-ups (non-blocking)

None of these break the feature; they came out of the final review and are worth doing if you touch this code again.

- **Tighten the drag guard.** `handlePointerMove` currently checks `if (!dragging || !dragOrigin.current)`. The `dragging` state lags pointerdown by one render. Guarding solely on `dragOrigin.current !== null` would catch sub-frame moves and simplify the code. Imperceptible in normal use.
- **Move `topWindow` state declaration.** In `describe/page.jsx`, `const [topWindow, setTopWindow] = useState("notepad");` is declared after `handleSubmit`. Other state hooks in the file are at the top. Cosmetic.
- **Document `MIN_TITLEBAR_VISIBLE = 80`.** The other two constants in `Window.jsx` cite their CSS source files. This one is a chosen UX value — a one-line comment would close the doc gap.
- **`width` undefined on a draggable Window.** Currently the clamp falls back to `w = 0`, which produces asymmetric horizontal bounds. Both current callers pass an explicit `width`, so it's a latent issue only.

## Known risk to watch in browser

- **Entry animation × absolute position.** The `.codeWindow` and `.notepadWindow` wrappers in `describe/page.module.css` run a `transform: scale(0.88) translateY(6px)` entry animation (60 ms / 180 ms delays, 360 ms duration). While `transform` is active, the wrapper becomes a CSS containing block, so the inner `Window`'s absolute positioning resolves against the wrapper instead of `.stage`. After the animation ends the containing block snaps back. Dragging during the first ~540 ms of page load *might* produce a visible jump. If so, options:
  - Add `isolation: isolate` to `.stage` to pin the containing block.
  - Hold the wrappers' final state with `will-change: transform`.
  - Move the entry animation onto the `Window` itself and drop the wrappers.

## Out of scope (explicitly deferred)

- Drag-to-resize, Aero Snap, snap-to-edges
- Real min/max/close behaviour
- Position persistence (sessionStorage / localStorage)
- A full window manager / `WindowGroup` context
- Editor and reimplement pages — `Window` and `Notepad` already accept the props; just pass `draggable` when ready
- Touch / mobile-specific tweaks beyond what pointer events give for free
- Keyboard window movement (Alt+Space etc.)
- Animation / drag momentum

## Reference

- Spec: `docs/superpowers/specs/2026-05-19-draggable-windows-design.md`
- Plan: `docs/superpowers/plans/2026-05-19-draggable-windows.md`
- Commits (oldest → newest):
  - `e5090c5` feat(window): add zIndex and onActivate props
  - `a51ccc6` feat(notepad): forward draggable/zIndex/onActivate to Window
  - `920e52a` feat(describe): bring window to front on click
  - `fc8c9af` feat(window): add cursor styling for drag handle
  - `924121d` feat(window): add opt-in drag behaviour
  - `887ca69` feat(window): clamp drag position to viewport and superbar
  - `6c2a7bb` feat(describe): enable drag on code and notepad windows
