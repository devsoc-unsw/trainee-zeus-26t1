# Error UI Surface — Design

**Date:** 2026-05-17
**Status:** Approved, ready for implementation
**Branch:** `error-ui`
**Scope:** Render `room:error` payloads to the user instead of swallowing them in `console.error`. New floating `<ErrorToast />` component, mounted once in the root layout, reads `useLobby().error` and `useRound().error`.

## Goal

When the server emits `room:error` (e.g. `NAME_TAKEN`, `ROOM_NOT_FOUND`, `GAME_IN_PROGRESS`, validation rejections), the user sees a visible message in the UI. Today these errors land in `state.error` on both hooks but nothing renders them.

## Current state

- `useLobby().error: {code, message} | null` — populated by the `on("room:error")` subscription inside the hook.
- `useRound().error: {code, message} | null` — same.
- `app/page.jsx` (wizard), `app/waiting-room/page.jsx`, the round pages, and `app/reveal/page.jsx` all destructure `error` (or could) but none render it.

## Approach

**Single floating toast in the bottom-right corner**, just above the Superbar, styled with the existing `GlassPanel`. It reads both hook errors via a tiny merging rule:

- Most recently set error wins (compare via a timestamp added when the error fires).
- Auto-dismiss 6 seconds after appearing.
- Manual dismiss via a small × button.
- Stacking: not in v1. One error at a time. New error overwrites the current one.

This is simpler than building a real toast queue and is enough for v1.

## Why this shape, not inline

Inline errors per route would mean five separate error renders, each with route-specific styling. The toast is one component, mounted once, that picks up errors from any phase — fits the "Win7 desktop notification" mental model the UI is already going for.

## File-level changes

### New: `frontend/src/components/error/ErrorToast.jsx` + `.module.css`

`"use client"` component. Reads both hooks, picks the freshest error, manages dismissal timer.

```jsx
"use client";

import { useEffect, useState } from "react";
import { useLobby } from "@/lib/socket/useLobby";
import { useRound } from "@/lib/socket/useRound";
import GlassPanel from "@/components/glass/GlassPanel";
import styles from "./ErrorToast.module.css";

const DISMISS_AFTER_MS = 6000;

export default function ErrorToast() {
  const { error: lobbyError } = useLobby();
  const { error: roundError } = useRound();

  // Track which error we're showing and when it arrived.
  const [shown, setShown] = useState(null); // {code, message, source: "lobby" | "round", id: number}

  useEffect(() => {
    if (lobbyError) {
      setShown({ ...lobbyError, source: "lobby", id: Date.now() });
    }
  }, [lobbyError]);

  useEffect(() => {
    if (roundError) {
      setShown({ ...roundError, source: "round", id: Date.now() });
    }
  }, [roundError]);

  useEffect(() => {
    if (!shown) return undefined;
    const t = setTimeout(() => setShown(null), DISMISS_AFTER_MS);
    return () => clearTimeout(t);
  }, [shown?.id]);

  if (!shown) return null;

  return (
    <div className={styles.toastWrap} role="alert">
      <GlassPanel className={styles.toast}>
        <div className={styles.iconBox} aria-hidden>!</div>
        <div className={styles.body}>
          <div className={styles.title}>{titleFor(shown.code)}</div>
          <div className={styles.message}>{shown.message}</div>
        </div>
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => setShown(null)}
          aria-label="Dismiss"
        >
          ×
        </button>
      </GlassPanel>
    </div>
  );
}

function titleFor(code) {
  switch (code) {
    case "NAME_TAKEN":      return "Name taken";
    case "ROOM_NOT_FOUND":  return "Room not found";
    case "GAME_IN_PROGRESS": return "Game already started";
    case "NOT_HOST":         return "Host only";
    case "TOO_FEW_PLAYERS":  return "Need more players";
    default:                 return "Error";
  }
}
```

### CSS

- Position `fixed`, `bottom: 64px` (above Superbar), `right: 16px`.
- `z-index: 10000` so it floats above windows.
- `min-width: 280px`, `max-width: 420px`.
- The icon box uses the same red ramp as the close-button (already a CSS var in `globals.css`).
- Fade-in on mount via a CSS transition on `opacity` + `transform: translateY`.

The styling should feel like Win7's balloon notifications — a tinted-glass surface with a small icon, title, body text, and a close X. Reuse existing tokens (`--text-on-glass`, `--font-ui`, etc.).

### Modify: `frontend/src/app/layout.jsx`

Mount `<ErrorToast />` alongside `<GameRouter />`:

```jsx
import GameRouter from "@/components/socket/GameRouter";
import ErrorToast from "@/components/error/ErrorToast";
// ...
<body>
  <GameRouter />
  <ErrorToast />
  <div className="desktop-root">
    ...
  </div>
</body>
```

Order doesn't matter (both render in document order, but `ErrorToast` is `position: fixed`).

## Scope

**In:**
- New `ErrorToast` component + CSS Module.
- One-line addition to `app/layout.jsx`.
- Title mapping for the ~6 known error codes; default to "Error" for unknown codes.

**Out (deferred):**
- Toast queue / stacking — single error replaces previous.
- Sound on error.
- Retry button for errors that are retryable (`NAME_TAKEN` could prompt for a new name) — out of scope.
- Persistence across page navigation — when the user navigates, hook errors reset; that's fine.

## Acceptance

- In dev with backend running: try `Join an existing room` with a non-existent code. Toast appears with title "Room not found" and the server's message.
- Toast auto-dismisses after ~6 seconds.
- Clicking × dismisses immediately.
- Submitting a name that's already in use shows "Name taken".
- All 6 routes still return HTTP 200; toast doesn't interfere with any route's layout.
- No errors in the browser console.

## Open items

- The toast competes for the bottom-right corner with the Win7 system tray (the Clock lives in the Superbar). The toast sits *above* the Superbar (`bottom: 64px`) — visually fine but worth eyeballing.
