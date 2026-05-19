# Input + Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the player's session (room/player IDs + lobby snapshot) and any in-progress phase draft to browser storage so refreshing the page reconnects them via `game:sync` with their unsaved text intact. Also persist the nickname across visits.

**Architecture:** A new `lib/socket/session.js` wraps `sessionStorage` (session + draft) and `localStorage` (nickname) with SSR-safe try/catch helpers. `lobby.js` hydrates the in-memory store from storage at module init and mirrors every `setLobby` write. `GameRouter` runs a one-shot `syncGame()` on mount when a persisted session exists. Each phase page reads any saved draft for its current `(roomId, roundNum)` on seed change, writes on every edit, and clears on successful submit. The home wizard pre-fills the nickname from storage.

**Tech Stack:** Next.js 16 App Router, plain JavaScript (`.jsx`/`.js`), React 19, native `sessionStorage` / `localStorage`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-19-input-persistence-design.md`

**Commit policy:** Do not auto-commit. Leave changes unstaged so the user can review and commit themselves. (Per project convention — the user handles all git operations.)

---

## File Map

- **Create:** `frontend/src/lib/socket/session.js` — storage wrapper for session bundle, draft, and nickname.
- **Modify:** `frontend/src/lib/socket/lobby.js` — hydrate `store.state` from storage at module init; mirror state changes to `saveSession`; clear storage on `leaveRoom`.
- **Modify:** `frontend/src/components/socket/GameRouter.jsx` — one-shot reconnect effect on mount.
- **Modify:** `frontend/src/app/editor/page.jsx` — draft load/save/clear for the write phase.
- **Modify:** `frontend/src/app/describe/page.jsx` — draft load/save/clear for the describe phase.
- **Modify:** `frontend/src/app/reimplement/page.jsx` — draft load/save/clear for the reimplement phase.
- **Modify:** `frontend/src/app/page.jsx` — nickname load on mount; save on every edit.

---

## Task 1: Create the storage wrapper

**Files:**
- Create: `frontend/src/lib/socket/session.js`

- [ ] **Step 1: Create `session.js` with all helpers**

Create `frontend/src/lib/socket/session.js` with this exact content:

```js
// frontend/src/lib/socket/session.js
//
// Browser-storage persistence for the Code Telephone client.
//
// - Session bundle (sessionStorage): roomId + playerId + cached lobby snapshot.
//   Per-tab so two tabs in the same browser can't fight over the same playerId.
//   See docs/superpowers/specs/2026-05-19-input-persistence-design.md.
// - Draft (sessionStorage): the in-progress editor/description text for the
//   current (roomId, roundNum). loadDraft enforces the key match so stale
//   drafts from a previous round never leak in.
// - Nickname (localStorage): just a string the user wants remembered across
//   visits.
//
// All access is guarded so SSR (no window) and storage-disabled browsers
// (Safari private mode, locked-down embeds) degrade to no-op rather than
// crashing.

const SESSION_KEY = "zeus.session.v1";
const DRAFT_KEY = "zeus.draft.v1";
const NICKNAME_KEY = "zeus.nickname.v1";

function sessionStore() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function localStore() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson(store, key) {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(store, key, value) {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled — no-op */
  }
}

function remove(store, key) {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* no-op */
  }
}

// ── Session bundle ─────────────────────────────────────────────────

/**
 * @returns {{
 *   roomId: string | null,
 *   code: string | null,
 *   playerId: string | null,
 *   hostId: string | null,
 *   roundCount: number | null,
 *   players: object[],
 * } | null}
 */
export function loadSession() {
  return readJson(sessionStore(), SESSION_KEY);
}

export function saveSession(snap) {
  if (!snap || !snap.roomId || !snap.playerId) return;
  writeJson(sessionStore(), SESSION_KEY, {
    roomId: snap.roomId ?? null,
    code: snap.code ?? null,
    playerId: snap.playerId ?? null,
    hostId: snap.hostId ?? null,
    roundCount: snap.roundCount ?? null,
    players: Array.isArray(snap.players) ? snap.players : [],
  });
}

export function clearSession() {
  remove(sessionStore(), SESSION_KEY);
}

// ── Active draft ───────────────────────────────────────────────────

/**
 * Returns the saved draft content only when (roomId, roundNum) match
 * the caller. Mismatched drafts return null so a stale entry never
 * leaks into a new round.
 *
 * @param {string} roomId
 * @param {number} roundNum
 * @returns {string | null}
 */
export function loadDraft(roomId, roundNum) {
  if (!roomId || !roundNum) return null;
  const stored = readJson(sessionStore(), DRAFT_KEY);
  if (!stored) return null;
  if (stored.roomId !== roomId || stored.roundNum !== roundNum) return null;
  return typeof stored.content === "string" ? stored.content : null;
}

export function saveDraft(roomId, roundNum, content) {
  if (!roomId || !roundNum) return;
  writeJson(sessionStore(), DRAFT_KEY, {
    roomId,
    roundNum,
    content: typeof content === "string" ? content : "",
  });
}

export function clearDraft() {
  remove(sessionStore(), DRAFT_KEY);
}

// ── Nickname ───────────────────────────────────────────────────────

/** @returns {string | null} */
export function loadNickname() {
  const store = localStore();
  if (!store) return null;
  try {
    return store.getItem(NICKNAME_KEY);
  } catch {
    return null;
  }
}

export function saveNickname(name) {
  const store = localStore();
  if (!store) return;
  try {
    if (typeof name === "string" && name.length > 0) {
      store.setItem(NICKNAME_KEY, name);
    } else {
      store.removeItem(NICKNAME_KEY);
    }
  } catch {
    /* no-op */
  }
}
```

- [ ] **Step 2: Sanity-check the file imports cleanly**

Run from `frontend/`:

```bash
cd frontend && npx eslint src/lib/socket/session.js
```

Expected: no errors. If eslint flags anything, fix it before moving on.

- [ ] **Step 3: Verify the dev server still boots**

Run from `frontend/`:

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000` with no compile errors. No behavior change yet — `session.js` isn't imported anywhere. Stop the server (Ctrl-C) before moving to Task 2.

---

## Task 2: Hydrate the lobby store from storage; mirror writes

**Files:**
- Modify: `frontend/src/lib/socket/lobby.js`

- [ ] **Step 1: Add the session.js import**

At the top of `frontend/src/lib/socket/lobby.js`, alongside the existing `client` import:

```js
import { connect, on, send } from "./client";
import {
  clearDraft,
  clearSession,
  loadSession,
  saveSession,
} from "./session";
```

- [ ] **Step 2: Hydrate `store.state` from storage at module init**

Find the existing `if (!globalThis[STORE_KEY]) { ... }` block (around line 27) and replace it with the version below. The change: when first creating the global store, seed `state` from `loadSession()` so `getSession()` returns the cached snapshot on first paint.

```js
if (!globalThis[STORE_KEY]) {
  const persisted = loadSession();
  globalThis[STORE_KEY] = {
    state: persisted
      ? {
          code: persisted.code ?? null,
          roomId: persisted.roomId ?? null,
          playerId: persisted.playerId ?? null,
          hostId: persisted.hostId ?? null,
          roundCount: persisted.roundCount ?? null,
          players: Array.isArray(persisted.players) ? persisted.players : [],
          gameStarted: false,
        }
      : { ...INITIAL_STATE },
    subscribers: new Set(),
    attached: false,
  };
}
const store = globalThis[STORE_KEY];
```

Note: `gameStarted` is intentionally `false` even when hydrating — the backend's `game:state` (delivered via `useRound` after `syncGame`) is authoritative on whether a game is in progress. `gameStarted` here is only used by `useLobby` consumers for the lobby→game transition, which the `GameRouter` already derives from `useRound`'s status.

- [ ] **Step 3: Mirror every `setLobby` write to storage**

Replace the existing `setLobby` function (around line 36) with this version. Only the last two lines inside the function are new — the rest is unchanged:

```js
function setLobby(patch) {
  store.state = { ...store.state, ...patch };
  for (const fn of [...store.subscribers]) {
    try {
      fn(store.state);
    } catch (err) {
      console.error("[lobby] subscriber threw:", err);
    }
  }
  // Mirror to sessionStorage so a refresh preserves room + player identity.
  // saveSession bails out when roomId / playerId are missing, so the empty
  // INITIAL_STATE doesn't pollute storage.
  saveSession(store.state);
}
```

- [ ] **Step 4: Clear storage on `leaveRoom`**

Replace the existing `leaveRoom` function (around line 157) with this version. The change: add `clearSession()` and `clearDraft()` calls before resetting in-memory state.

```js
export async function leaveRoom() {
  send("room:leave", {});
  clearSession();
  clearDraft();
  setLobby({ ...INITIAL_STATE });
}
```

- [ ] **Step 5: Verify in browser**

Run `npm run dev` and exercise these flows:

1. Open `http://localhost:3000`, complete the wizard with nickname "Alice" → Create Room. You should land on `/waiting-room` with a room code.
2. Open DevTools → Application → Session Storage → `http://localhost:3000`. Confirm a `zeus.session.v1` entry exists with `roomId`, `code`, `playerId`, `hostId`, and `players[0].name === "Alice"`.
3. Click "Leave" from the waiting room. Confirm `zeus.session.v1` is removed from sessionStorage.

If sessionStorage is not being written, double-check that the `saveSession` call in Step 3 is inside `setLobby`. Stop the dev server before moving on.

---

## Task 3: Auto-reconnect on mount in GameRouter

**Files:**
- Modify: `frontend/src/components/socket/GameRouter.jsx`

- [ ] **Step 1: Add the new imports**

At the top of `frontend/src/components/socket/GameRouter.jsx`, alongside the existing imports:

```js
"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLobby } from "@/lib/socket/useLobby";
import { useRound } from "@/lib/socket/useRound";
import { getSession } from "@/lib/socket/lobby";
import { syncGame } from "@/lib/socket/round";
import { clearDraft, clearSession } from "@/lib/socket/session";
```

- [ ] **Step 2: Add the one-shot reconnect effect**

Inside the `GameRouter` function, before the existing `target = useMemo(...)` block, add the reconnect ref and effect:

```js
export default function GameRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const { roomCode } = useLobby();
  const { status, roundType, roundNum } = useRound();

  // One-shot reconnect on mount: if storage has a session, reattach via
  // game:sync. On failure (room gone, server restarted), clear storage and
  // let the routing effect below land the user on / naturally.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    const persisted = getSession();
    if (!persisted.roomId || !persisted.playerId) return;
    syncGame(persisted.roomId, persisted.playerId).catch((err) => {
      console.warn("[GameRouter] sync failed; clearing session:", err);
      clearSession();
      clearDraft();
    });
  }, []);

  const target = useMemo(() => {
    // ... existing code, unchanged
```

Keep the rest of the file unchanged.

- [ ] **Step 3: Verify the reconnect flow in browser**

Run `npm run dev`. Open two browser windows (or two profiles) at `http://localhost:3000`.

1. Window A: nickname "Host", Create Room. Note the room code.
2. Window B: nickname "B", Join with the code → `/waiting-room`.
3. Open a third window/profile, nickname "C", Join. Three players in the lobby.
4. Window A: Click Start Game. All three windows should move to `/editor`.
5. In Window B, type some code into the editor.
6. Refresh Window B (Cmd-R / Ctrl-R).

Expected:
- Window B reconnects via `game:sync` (visible in DevTools → Network → WS frames as `game:sync` → `game:state`).
- Window B lands back on `/editor` for round 1.
- The room code at the top of the window matches what it was before.
- (Draft restoration comes in Task 4 — the editor will still show the starter line for now. Verifying that the page renders the right phase is enough here.)

If Window B lands on `/` instead, check that `getSession()` is returning the persisted snapshot (add a `console.log(persisted)` to the effect). Stop the dev server.

---

## Task 4: Draft persistence in `/editor`

**Files:**
- Modify: `frontend/src/app/editor/page.jsx`

- [ ] **Step 1: Add the new imports**

At the top of `frontend/src/app/editor/page.jsx`, alongside the existing imports:

```js
"use client";

import { useEffect, useState } from "react";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import Button from "@/components/input/Button";
import styles from "./page.module.css";
import { useRound } from "@/lib/socket/useRound";
import { useLobby } from "@/lib/socket/useLobby";
import { clearDraft, loadDraft, saveDraft } from "@/lib/socket/session";
```

- [ ] **Step 2: Read `roomId` from the lobby hook**

Inside `EditorDemo`, just below the existing `useRound()` destructure, add the lobby hook:

```js
export default function EditorDemo() {
  const {
    roundNum,
    seed,
    secondsLeft,
    submittedCount,
    totalPlayers,
    hasSubmitted,
    submit,
  } = useRound();
  const { roomId } = useLobby();
```

- [ ] **Step 3: Replace the seed-effect with a draft-aware version**

Find the existing block (the `useState(starterCode)` line and the `useEffect([starterCode])` that re-seeds it) and replace with:

```js
  const promptText = seed?.promptText ?? FALLBACK_PROMPT;
  const starterCode = seed?.starterLine ?? FALLBACK_STARTER;
  // TODO: language is NOT in the round protocol — picked at lobby creation
  //       in the UI but not yet on the wire. Hardcoded for now.
  const language = "python";

  const [editorValue, setEditorValue] = useState(starterCode);

  // On round arrival (or refresh into an active round), prefer a saved draft
  // for (roomId, roundNum) over the starter line. loadDraft returns null when
  // the stored key doesn't match, so a stale draft never bleeds in.
  useEffect(() => {
    if (!roomId || !roundNum) return;
    const saved = loadDraft(roomId, roundNum);
    setEditorValue(saved ?? starterCode);
  }, [roomId, roundNum, starterCode]);
```

- [ ] **Step 4: Save the draft on every change**

Replace the existing `handleSubmit` block and the `<CodeEditor onChange={setEditorValue} ... />` JSX prop. First, add a change handler above `handleSubmit`:

```js
  const handleEditorChange = (val) => {
    setEditorValue(val);
    if (roomId && roundNum) saveDraft(roomId, roundNum, val);
  };

  const handleSubmit = () => {
    submit(editorValue)
      .then(() => clearDraft())
      .catch((err) => console.error("[editor] submit failed:", err));
  };
```

Then update the `<CodeEditor>` JSX:

```jsx
            <CodeEditor
              value={editorValue}
              onChange={handleEditorChange}
              language={language}
              fileName="solution"
              height={380}
            />
```

- [ ] **Step 5: Verify in browser**

Run `npm run dev`. Run a 3-player game as in Task 3.

1. On `/editor`, type some code (e.g. `def hello():\n    return "world"`).
2. Open DevTools → Application → Session Storage. Confirm `zeus.draft.v1` exists with `roomId`, `roundNum: 1`, and the typed content.
3. Refresh the tab. Expected: the page lands back on `/editor` with your typed code restored exactly.
4. Submit the code. Confirm `zeus.draft.v1` is removed from sessionStorage after the round completes successfully.

Stop the dev server.

---

## Task 5: Draft persistence in `/describe`

**Files:**
- Modify: `frontend/src/app/describe/page.jsx`

- [ ] **Step 1: Add the new imports**

At the top of `frontend/src/app/describe/page.jsx`, alongside the existing imports:

```js
"use client";

import { useState } from "react";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import Notepad from "@/components/notepad/Notepad";
import PhaseHUD from "@/components/game/PhaseHUD";
import styles from "./page.module.css";
import { useRound } from "@/lib/socket/useRound";
import { useLobby } from "@/lib/socket/useLobby";
import { clearDraft, loadDraft, saveDraft } from "@/lib/socket/session";
```

- [ ] **Step 2: Read `roomId` + `roundNum` from the hooks**

Inside `DescribeDemo`, extend the existing destructure:

```js
export default function DescribeDemo() {
  const {
    roundNum,
    seed,
    secondsLeft,
    submittedCount,
    totalPlayers,
    hasSubmitted,
    submit,
  } = useRound();
  const { roomId } = useLobby();
```

- [ ] **Step 3: Replace the seed-change reset with a draft-aware version**

Find the existing `const [lastReceivedCode, setLastReceivedCode] = useState(receivedCode);` block and the `if (receivedCode !== lastReceivedCode) { ... }` block below it, and replace both with:

```js
  const [description, setDescription] = useState("");
  const [lastReceivedCode, setLastReceivedCode] = useState(receivedCode);

  // Compare-in-render: when the seed's receivedCode flips to a new round,
  // restore the draft for that (roomId, roundNum) if one was saved,
  // otherwise start blank.
  if (receivedCode !== lastReceivedCode) {
    setLastReceivedCode(receivedCode);
    const saved =
      roomId && roundNum ? loadDraft(roomId, roundNum) : null;
    setDescription(saved ?? "");
  }
```

- [ ] **Step 4: Save the draft on every change**

Add a change handler above `handleSubmit` and update `handleSubmit` itself:

```js
  const handleDescriptionChange = (val) => {
    setDescription(val);
    if (roomId && roundNum) saveDraft(roomId, roundNum, val);
  };

  const handleSubmit = () => {
    submit(description)
      .then(() => clearDraft())
      .catch((err) => console.error("[describe] submit failed:", err));
  };
```

Then update the `<Notepad>` JSX to use the new handler:

```jsx
      <div className={styles.notepadWindow}>
        <Notepad
          fileName="Untitled"
          value={description}
          onChange={handleDescriptionChange}
          placeholder={NOTEPAD_PLACEHOLDER}
          x={640}
          y={88}
          width={440}
          height={460}
        />
      </div>
```

- [ ] **Step 5: Verify in browser**

Run `npm run dev` and run a 3-player game through round 1 → round 2.

1. On `/describe`, type a description into the Notepad.
2. Open DevTools → Application → Session Storage. Confirm `zeus.draft.v1` shows `roundNum: 2` and your text.
3. Refresh the tab. Expected: the page lands back on `/describe` with your description restored.
4. Submit. Confirm `zeus.draft.v1` is removed after the round completes.

Stop the dev server.

---

## Task 6: Draft persistence in `/reimplement`

**Files:**
- Modify: `frontend/src/app/reimplement/page.jsx`

- [ ] **Step 1: Add the new imports**

At the top of `frontend/src/app/reimplement/page.jsx`, alongside the existing imports:

```js
"use client";

import { useState } from "react";
import Notepad from "@/components/notepad/Notepad";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import PhaseHUD from "@/components/game/PhaseHUD";
import styles from "./page.module.css";
import { useRound } from "@/lib/socket/useRound";
import { useLobby } from "@/lib/socket/useLobby";
import { clearDraft, loadDraft, saveDraft } from "@/lib/socket/session";
```

- [ ] **Step 2: Read `roomId` + `roundNum` from the hooks**

Inside `ReimplementDemo`, extend the destructure:

```js
export default function ReimplementDemo() {
  const {
    roundNum,
    seed,
    secondsLeft,
    submittedCount,
    totalPlayers,
    hasSubmitted,
    submit,
  } = useRound();
  const { roomId } = useLobby();
```

- [ ] **Step 3: Replace the seed-change reset with a draft-aware version**

Find the existing `const [lastReceivedDescription, setLastReceivedDescription] = useState(receivedDescription);` block and the `if (receivedDescription !== lastReceivedDescription) { ... }` block below it, and replace both with:

```js
  const [reconstructedCode, setReconstructedCode] = useState("");
  const [lastReceivedDescription, setLastReceivedDescription] =
    useState(receivedDescription);

  // Compare-in-render: when the seed flips to a new round's description,
  // restore the draft for that (roomId, roundNum) if one was saved,
  // otherwise start blank.
  if (receivedDescription !== lastReceivedDescription) {
    setLastReceivedDescription(receivedDescription);
    const saved =
      roomId && roundNum ? loadDraft(roomId, roundNum) : null;
    setReconstructedCode(saved ?? "");
  }
```

- [ ] **Step 4: Save the draft on every change**

Add a change handler above `handleSubmit` and update `handleSubmit`:

```js
  const handleCodeChange = (val) => {
    setReconstructedCode(val);
    if (roomId && roundNum) saveDraft(roomId, roundNum, val);
  };

  const handleSubmit = () => {
    submit(reconstructedCode)
      .then(() => clearDraft())
      .catch((err) => console.error("[reimplement] submit failed:", err));
  };
```

Then update the `<CodeEditor>` JSX:

```jsx
          <CodeEditor
            value={reconstructedCode}
            onChange={handleCodeChange}
            language={language}
            fileName="solution"
            height={428}
            showStatusBar
          />
```

- [ ] **Step 5: Verify in browser**

Run `npm run dev` and run a 3-player game through round 1 → round 2 → round 3.

1. On `/reimplement`, type some reconstructed code.
2. Open DevTools → Application → Session Storage. Confirm `zeus.draft.v1` shows `roundNum: 3` and your text.
3. Refresh the tab. Expected: page lands on `/reimplement` with your code restored.
4. Submit. Confirm `zeus.draft.v1` is removed.

Stop the dev server.

---

## Task 7: Nickname persistence on the home wizard

**Files:**
- Modify: `frontend/src/app/page.jsx`

- [ ] **Step 1: Add the new imports**

At the top of `frontend/src/app/page.jsx`, alongside the existing imports:

```js
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import Radio from "@/components/input/Radio";
import TextField from "@/components/input/TextField";
import { createRoom, joinRoom } from "@/lib/socket/lobby";
import { loadNickname, saveNickname } from "@/lib/socket/session";
import styles from "./page.module.css";
```

- [ ] **Step 2: Load the saved nickname on mount**

Inside `Home`, just below the existing `useState` declarations, add:

```js
  // Pre-fill the nickname on mount from localStorage. Done in an effect
  // (not a lazy useState initializer) to avoid an SSR/CSR hydration
  // mismatch — the server has no access to localStorage.
  useEffect(() => {
    const saved = loadNickname();
    if (saved) setNickname(saved);
  }, []);
```

- [ ] **Step 3: Persist on every nickname change**

Find the `NicknameStep` component (toward the bottom of the file) and change its `TextField` `onChange` to also call `saveNickname`. Replace the `NicknameStep` function with:

```js
function NicknameStep({ value, onChange }) {
  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    saveNickname(v);
  };
  return (
    <div className={styles.stepBody}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Your nickname:</span>
        <TextField
          value={value}
          onChange={handleChange}
          placeholder="e.g. Jordan"
          maxLength={20}
          autoFocus
        />
      </label>
      <p className={styles.hint}>
        This is how other players will see you in the chain. You can use up to
        20 characters.
      </p>
    </div>
  );
}
```

Note: `saveNickname` needs to be in scope inside `NicknameStep`. Since it's a named import at the top of the file, it is.

- [ ] **Step 4: Verify in browser**

Run `npm run dev`:

1. Open `http://localhost:3000`. Type "Alice" into the nickname field.
2. Open DevTools → Application → Local Storage → `http://localhost:3000`. Confirm `zeus.nickname.v1` = `Alice`.
3. Close the tab entirely. Open a new tab to `http://localhost:3000`. Expected: the nickname field is pre-filled with "Alice".
4. Clear the field, type "Bob". Confirm `zeus.nickname.v1` updates to `Bob`.
5. Clear the field entirely. Confirm `zeus.nickname.v1` is removed from localStorage.

Stop the dev server.

---

## Task 8: End-to-end acceptance walkthrough

**Files:** None — verification only.

- [ ] **Step 1: Full happy path**

Run `npm run dev`. Open three browser windows (or profiles) at `http://localhost:3000`.

1. Window A: nickname "Alice", Create Room. Note the code.
2. Window B: nickname "Bob", Join with code.
3. Window C: nickname "Carol", Join with code.
4. Window A: Start Game. All windows move to `/editor`.
5. Type partial code in each window.
6. Refresh Window B. Expected: lands on `/editor`, room code matches, host badge on Alice preserved, Bob's typed code restored.
7. Submit all three. Move through `/describe` round 2; type text, refresh Window B mid-round, confirm restore.
8. Move through `/reimplement` round 3; type code, refresh Window C, confirm restore.
9. Reach `/reveal`. Click "Play again" (host only — Alice). Confirm all three windows return to lobby; sessionStorage `zeus.session.v1` is updated, `zeus.draft.v1` is gone.

- [ ] **Step 2: Failure mode — stale session, room gone**

1. With Window A in a fresh room, kill the backend process (Ctrl-C the FastAPI server). Restart it (`uvicorn app.main:app --reload --port 8000`).
2. Refresh Window A. Expected:
   - Reconnect attempt visible in DevTools → Network → WS frames.
   - `room:error` with `code: "ROOM_NOT_FOUND"` arrives.
   - `zeus.session.v1` is removed from sessionStorage.
   - The ErrorToast appears with "Room not found".
   - Window A lands on `/` (the wizard).
   - `zeus.nickname.v1` is still in localStorage — nickname pre-fills.

- [ ] **Step 3: Failure mode — storage disabled**

1. Open DevTools → Application → Session Storage. Right-click → Clear.
2. In a fresh tab, open Chrome → DevTools → Settings (F1) → enable "Block all cookies (may break sites)". Alternatively, use Safari Private Browsing or Firefox's strict tracking-protection mode.
3. Run through the wizard and create a room. Expected: the app still works end-to-end; refresh just drops you back to `/` (no persistence available).

If any step fails, return to the relevant task and fix.

---

## Out of scope for this plan

These are explicitly deferred per the spec — do NOT implement:

- Persisting wizard step/method/join-code beyond the nickname.
- Cross-device session restore.
- Auto-save of drafts to the backend.
- A dedicated "your previous session expired" modal (the existing toast is enough).
- Encrypting the storage payload.
