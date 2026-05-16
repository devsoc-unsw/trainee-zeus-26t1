# Error UI Toast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface `room:error` payloads to the user via a single floating `<ErrorToast />` mounted once in `app/layout.jsx`, reading `useLobby().error` and `useRound().error`.

**Architecture:** A "use client" component subscribes to both hooks. It keeps one local `shown` state (most-recent error wins, single-slot, no queue). Auto-dismiss after 6s; manual dismiss via × button. Styled like a Win7 balloon notification using the existing `GlassPanel`, positioned `fixed; bottom: 64px; right: 16px; z-index: 10000` so it sits 24px above the 40px Superbar and over any window chrome.

**Tech Stack:** Next.js 16.2.1 (App Router), React 19.2.4, plain JavaScript (`.jsx` / `.js`), CSS Modules. No test runner is configured in `frontend/` — verification is `npm run lint` + `npm run build` + manual browser acceptance.

**Source spec:** `docs/superpowers/specs/2026-05-17-error-ui-toast.md`.

---

## Operating notes for the executor

- **No auto-commits.** This repo's owner has a standing rule: do not run `git commit` without explicit confirmation, even when a skill says to. The commit steps below are written so the work *can* be committed at clean checkpoints; pause and confirm with the user each time before running them.
- **No frontend test runner.** `package.json` defines `dev`, `build`, `start`, `lint` — there is no `test` script and no jest/vitest config. Do NOT add a test framework just for this feature (YAGNI). Verification leans on `npm run lint`, `npm run build`, and the manual browser checklist in Task 6.
- **Next.js 16 caveat (per `frontend/AGENTS.md`).** Treat anything Next-specific as potentially changed from training; this feature only uses stable App Router patterns (a `"use client"` component imported into a server layout, React hooks, CSS Modules), so no docs lookup is needed unless something unexpected appears.
- **Dev server.** Run from `frontend/`: `npm run dev` → http://localhost:3000. The backend must also be running (`uvicorn app.main:app --reload --port 8000` from `backend/` after `source ../.env && set -a && source ../.env && set +a`) for Task 6's browser tests, since errors come from the WebSocket.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/components/error/ErrorToast.jsx` | **Create** | The "use client" toast component: subscribe to both hooks, manage `shown` state, render the toast UI when present. |
| `frontend/src/components/error/ErrorToast.module.css` | **Create** | Toast positioning, glass styling, sheen, fade-in transition. |
| `frontend/src/app/layout.jsx` | **Modify** | Import `ErrorToast` and mount it alongside `<GameRouter />`. |

No other files change. The `useLobby` and `useRound` hooks already emit the `{code, message}` shape this component consumes — confirmed in `frontend/src/lib/socket/useLobby.js:42-56` and `frontend/src/lib/socket/useRound.js:109-117`.

---

## Task 1: Create the CSS module

**Files:**
- Create: `frontend/src/components/error/ErrorToast.module.css`

- [ ] **Step 1: Create the directory and CSS file**

```bash
mkdir -p frontend/src/components/error
```

Then write `frontend/src/components/error/ErrorToast.module.css` with this exact content:

```css
/* Floating Win7-style balloon notification.
   Pinned bottom-right, above the 40px Superbar (z-index 1000).
   Highest z-index in the app: 10000. */

.toastWrap {
  position: fixed;
  bottom: 64px;
  right: 16px;
  z-index: 10000;
  pointer-events: none;
  animation: toastIn 180ms ease-out;
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 280px;
  max-width: 420px;
  padding: 10px 12px;
  pointer-events: auto;
  font-family: var(--font-ui);
  color: var(--text-on-glass);
}

.iconBox {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  background: linear-gradient(
    to bottom,
    var(--close-red-700) 61.3%,
    var(--close-red-500) 70.8%,
    var(--close-red-300) 93.3%
  );
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  line-height: 1;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.body {
  flex: 1 1 auto;
  min-width: 0;
}

.title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 2px;
}

.message {
  font-size: 11px;
  color: var(--text-muted);
  word-wrap: break-word;
}

.dismiss {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-on-glass);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  border-radius: 2px;
  padding: 0;
}

.dismiss:hover {
  background: rgba(0, 0, 0, 0.08);
}
```

Notes on the CSS choices:
- `pointer-events: none` on `.toastWrap` + `pointer-events: auto` on `.toast` means the surrounding empty area never blocks clicks on the desktop or windows.
- The iconBox reuses the exact 3-stop close-button red gradient from `globals.css` lines 17–19 (vars already exist: `--close-red-700`, `--close-red-500`, `--close-red-300`).
- `--font-ui`, `--text-on-glass`, `--text-muted` are existing tokens (confirmed in `frontend/src/app/globals.css`).
- Animation is on `.toastWrap` (the outer fixed div) so the GlassPanel itself doesn't need to change.

- [ ] **Step 2: Verify the file lints clean**

CSS modules are processed by Next, not ESLint, but a syntax error would surface at build time. Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds (the file isn't imported yet, but it should be valid CSS so Next doesn't choke when we wire it in next task).

Actually — Next won't process this CSS module until something imports it, so the build will pass even with broken CSS at this stage. We'll verify it for real after Task 2.

---

## Task 2: Create the ErrorToast component

**Files:**
- Create: `frontend/src/components/error/ErrorToast.jsx`

- [ ] **Step 1: Write the component**

Write `frontend/src/components/error/ErrorToast.jsx` with this exact content:

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

  // Single-slot toast. Latest error wins. `id` is the arrival timestamp
  // and also doubles as the key for the auto-dismiss effect.
  const [shown, setShown] = useState(null);

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
        <div className={styles.iconBox} aria-hidden>
          !
        </div>
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
    case "NAME_TAKEN":
      return "Name taken";
    case "ROOM_NOT_FOUND":
      return "Room not found";
    case "GAME_IN_PROGRESS":
      return "Game already started";
    case "NOT_HOST":
      return "Host only";
    case "TOO_FEW_PLAYERS":
      return "Need more players";
    default:
      return "Error";
  }
}
```

Notes on what to verify *while writing*, not after:
- The `@/components/glass/GlassPanel` import path matches the rest of the codebase (e.g. `frontend/src/components/socket/GameRouter.jsx` uses `@/lib/socket/useLobby`). `jsconfig.json` maps `@/*` to `./src/*`.
- `GlassPanel` accepts `className` and forwards other props (`frontend/src/components/glass/GlassPanel.jsx:5`). Passing `styles.toast` to set the flex layout is correct.
- The hook return shape is confirmed: `useLobby().error` is `{code, message} | null` (`useLobby.js:33`) and same for `useRound().error` (`useRound.js:47`).
- React 19 + Next 16: no API on this page differs from older versions. `useState`/`useEffect` behave normally.

- [ ] **Step 2: Lint and build to catch typos / bad imports**

```bash
cd frontend && npm run lint && npm run build
```

Expected: both succeed with no errors. If lint flags an unused import or unused variable, fix it before proceeding (don't suppress the rule).

---

## Task 3: Mount the toast in the root layout

**Files:**
- Modify: `frontend/src/app/layout.jsx`

- [ ] **Step 1: Add the import and render**

Edit `frontend/src/app/layout.jsx`. The existing file is 22 lines. Change the two imports to include `ErrorToast`, and add `<ErrorToast />` directly after `<GameRouter />` in the body.

Final contents should be:

```jsx
import "./globals.css";
import Superbar from "@/components/desktop/Superbar";
import GameRouter from "@/components/socket/GameRouter";
import ErrorToast from "@/components/error/ErrorToast";

export const metadata = {
  title: "Code Telephone",
  description: "A multiplayer coding game in the spirit of Telephone.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <GameRouter />
        <ErrorToast />
        <div className="desktop-root">
          <div className="window-area">{children}</div>
          <Superbar />
        </div>
      </body>
    </html>
  );
}
```

Notes:
- The order of `<GameRouter />` and `<ErrorToast />` doesn't matter — both are `position`-less / `position: fixed` and don't reserve flow space. Render order does not affect z-index here.
- `layout.jsx` has no `"use client"`. It stays a server component and can import the client component `ErrorToast` without any change — that's a standard App Router pattern and unchanged in Next 16.

- [ ] **Step 2: Lint and build again**

```bash
cd frontend && npm run lint && npm run build
```

Expected: both succeed. If the build complains about a missing import, double-check the path is `@/components/error/ErrorToast` and matches the file's actual location.

---

## Task 4: Smoke-check in the dev server

**Files:** None — pure runtime verification.

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```

Expected output includes `Local: http://localhost:3000` and no compile errors in the terminal.

- [ ] **Step 2: Load the homepage**

Open `http://localhost:3000` in a browser. The wizard should render normally — no visible toast (no error has fired), no console errors, no layout shifts.

If the browser console shows a React error referencing `ErrorToast`, stop and diagnose. Most likely causes:
- Mis-typed CSS Module class name (would log a warning about `undefined` className).
- Forgot the `"use client"` directive on `ErrorToast.jsx` (Next will surface a clear error about hooks in a server component).

---

## Task 5: Trigger errors end-to-end with the backend

**Files:** None — manual verification against the spec's acceptance criteria.

This task requires the backend running. If it isn't:

```bash
cd backend
source .venv/bin/activate
set -a && source ../.env && set +a
uvicorn app.main:app --reload --port 8000
```

Then with `npm run dev` still running for the frontend:

- [ ] **Step 1: Verify `ROOM_NOT_FOUND` toast**

In the browser at `http://localhost:3000`:
1. Enter a nickname, click Next.
2. Choose **Join an existing room**.
3. Enter a fake room code (e.g. `ROOM-XXXX`) and submit.

Expected:
- A glass toast slides up from the bottom-right (above the Superbar).
- Title: "Room not found".
- Message: whatever the server returned for that code (typically "Room not found." or similar).
- The toast auto-dismisses after ~6 seconds.

- [ ] **Step 2: Verify `NAME_TAKEN` toast**

1. From a first browser/tab, create a room with name "Alice".
2. In a second tab, copy the room code, join with the same name "Alice".

Expected:
- Second tab shows a toast with title "Name taken" and the server's message.
- Auto-dismiss after ~6 seconds.

- [ ] **Step 3: Verify manual dismissal**

1. Trigger any error (the simplest is the `ROOM_NOT_FOUND` flow above).
2. While the toast is visible, click the × button on the right.

Expected: the toast disappears immediately.

- [ ] **Step 4: Verify "most-recent wins"**

1. Trigger a `ROOM_NOT_FOUND` toast.
2. Without dismissing, immediately trigger another error (e.g. submit the form again with another bad code).

Expected: the toast's title/message updates to reflect the newer error, and the 6-second timer restarts from the new arrival.

- [ ] **Step 5: Verify no regressions**

Walk all five routes (`/`, `/waiting-room`, `/editor`, `/describe`, `/reimplement`, `/reveal`) with no error condition. Expected:
- Each route still returns HTTP 200 and renders normally.
- No toast appears.
- No new console errors.
- The toast's `position: fixed` doesn't push any other content around.

---

## Task 6: Optional commit checkpoint

**Files:** None — this is a confirmation step.

- [ ] **Step 1: Confirm with the user before committing**

The repo's standing rule (see `MEMORY.md` → "Don't make git commits without explicit ask") means this step pauses for the user. Show them what's staged and ask whether to commit.

```bash
git status
git diff --stat
```

If the user OKs the commit:

```bash
git add frontend/src/components/error/ErrorToast.jsx \
        frontend/src/components/error/ErrorToast.module.css \
        frontend/src/app/layout.jsx
git commit -m "feat(error-ui): surface room:error payloads via floating toast

Mount <ErrorToast /> once in app/layout.jsx. Reads useLobby().error
and useRound().error, shows the most recently arrived error as a
Win7-balloon-style notification above the Superbar, auto-dismisses
after 6s, manual dismiss via the × button."
```

If the user also wants the spec committed (it's currently untracked):

```bash
git add docs/superpowers/specs/2026-05-17-error-ui-toast.md \
        docs/superpowers/plans/2026-05-17-error-ui-toast.md
git commit -m "docs(error-ui): add spec and implementation plan"
```

Do NOT push without explicit instruction.

---

## Out of scope (for reference)

These are deferred per the spec — do not implement:
- Toast queue / stacking.
- Sound on error.
- Retry button for retryable errors like `NAME_TAKEN`.
- Persistence of the toast across page navigation (when hook state resets, the toast disappears; that's fine).

## Open item flagged in the spec

The toast sits at `bottom: 64px` and the Superbar's Clock sits inside the 40px Superbar at the right edge. They don't physically collide, but during Task 5 Step 5 it's worth eyeballing for visual harmony. If it feels too close to the Clock, bump `bottom` to 72px or 80px — no other code needs to change.
