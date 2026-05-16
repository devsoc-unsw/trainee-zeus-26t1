# Round Networking Stubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create function stubs (signatures + JSDoc + TODO bodies) for the frontend round-phase WebSocket actions and React hook, and wire the three round-phase pages (`/editor`, `/describe`, `/reimplement`) to import them. A teammate will fill in the bodies.

**Architecture:** Two new files in `frontend/src/lib/socket/` — `round.js` (imperative actions) and `useRound.js` (React hook). The hook returns a safe default empty shape so the round-phase pages still render. The three pages remove their module-level mock constants and read from the hook instead.

**Tech Stack:** Plain JavaScript (`.js`, no TS), React 19 / Next.js 16 App Router, native `WebSocket`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-16-round-networking-stubs.md`

**Commit policy:** Do not auto-commit. Leave changes unstaged so the user can review and commit themselves.

---

## File Map

- **Create:** `frontend/src/lib/socket/round.js` — `submitRound`, `syncGame`, `resetGame`
- **Create:** `frontend/src/lib/socket/useRound.js` — `useRound()` React hook
- **Modify:** `frontend/src/app/editor/page.jsx` — convert to client component, swap mocks for hook
- **Modify:** `frontend/src/app/describe/page.jsx` — same
- **Modify:** `frontend/src/app/reimplement/page.jsx` — same

**Note on component state:** `CodeEditor` and `Notepad` both manage their own internal state and do **not** expose the current value via props. The stub wires submit handlers to `submit("")` with a TODO comment — the teammate filling in bodies will need to either add `value`/`onChange` props to those components or use a ref/imperative handle to read the content. Out of scope for this stub pass.

---

## Task 1: Create `lib/socket/round.js`

**Files:**
- Create: `frontend/src/lib/socket/round.js`

- [ ] **Step 1: Write the file**

```js
// frontend/src/lib/socket/round.js
//
// Imperative round-phase actions. Used by the three round pages and
// the reveal screen.
//
// Each action sends one event over the singleton client and awaits
// the matching server reply (or rejects on `room:error`).
// See docs/API.md for the protocol.

/**
 * Send `round:submit` for the active round. Resolves once the server
 * broadcasts `round:player_submitted` for this player. Rejects on
 * `room:error` (e.g. "already submitted" or "no active round").
 *
 * @param {string} content - The submission text. For write/reimplement
 *                           rounds this is code; for describe rounds it
 *                           is the plain-English description.
 * @returns {Promise<void>}
 */
export async function submitRound(content) {
  // TODO: implement
  // - send `round:submit` with {content}
  // - listen once for `round:player_submitted` matching our playerId
  // - reject on `room:error`
  throw new Error("not implemented");
}

/**
 * Send `game:sync` to reattach the current socket to an existing room
 * and player after a reconnect. Resolves with the `game:state` snapshot.
 *
 * @param {string} roomId
 * @param {string} playerId
 * @returns {Promise<{
 *   status: "lobby" | "active" | "over",
 *   roundNum: number,
 *   secondsLeft: number,
 *   seed: object | null,
 *   submitted: boolean,
 *   players: object[],
 * }>}
 */
export async function syncGame(roomId, playerId) {
  // TODO: implement
  throw new Error("not implemented");
}

/**
 * Send `game:reset` to return the room to lobby after the game has ended.
 * Host only — non-host calls reject with `room:error`. Resolves on the
 * next `room:updated` broadcast.
 *
 * @returns {Promise<void>}
 */
export async function resetGame() {
  // TODO: implement
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Verify the file parses**

Run: `node --check frontend/src/lib/socket/round.js`
Expected: exit 0, no output.

---

## Task 2: Create `lib/socket/useRound.js`

**Critical design note:** Same pattern as `useLobby` — the hook itself must NOT throw on render. It returns the default empty shape so all three round-phase pages render without crashing. Only the bound `submit` method throws when invoked.

**Files:**
- Create: `frontend/src/lib/socket/useRound.js`

- [ ] **Step 1: Write the file**

```js
// frontend/src/lib/socket/useRound.js
//
// React hook exposing reactive round state + bound submit. Subscribes
// to the singleton client.js, listens for `round:begin`,
// `round:player_submitted`, `round:ended`, `game:reveal`, `game:over`,
// `room:error`.
//
// Stub: returns the default empty shape so pages render. The bound
// `submit` method throws on invocation until implemented.

/**
 * Subscribe to round state. The page that renders for the current round
 * is determined by `roundType`. `chains` is populated only when
 * `status === "reveal"`.
 *
 * @returns {{
 *   status:         "idle" | "lobby" | "active" | "reveal" | "over",
 *   roundNum:       number | null,
 *   roundType:      "write" | "describe" | "reimplement" | null,
 *   seed:           {
 *                     prompt?: string,
 *                     code?: string,
 *                     description?: string,
 *                     language?: "python" | "javascript" | "java"
 *                   } | null,
 *   secondsLeft:    number | null,
 *   hasSubmitted:   boolean,
 *   submittedCount: number,
 *   totalPlayers:   number,
 *   chains:         object[] | null,
 *   error:          { code: string, message: string } | null,
 *   submit:         (content: string) => Promise<void>,
 * }}
 */
export function useRound() {
  // TODO: implement
  // - subscribe to client.on("round:begin", ...) etc. via useEffect
  // - hold reactive state with useState or useSyncExternalStore
  // - drive a setInterval for secondsLeft countdown
  // - bind submit to round.submitRound
  //
  // Returning the default empty shape so the round pages render during
  // the stub phase. Once implemented, the bound submit should also stop
  // throwing on invocation.
  return {
    status: "idle",
    roundNum: null,
    roundType: null,
    seed: null,
    secondsLeft: null,
    hasSubmitted: false,
    submittedCount: 0,
    totalPlayers: 0,
    chains: null,
    error: null,
    submit: async (_content) => {
      throw new Error("not implemented");
    },
  };
}
```

- [ ] **Step 2: Verify the file parses**

Run: `node --check frontend/src/lib/socket/useRound.js`
Expected: exit 0.

---

## Task 3: Wire `app/editor/page.jsx` (Write phase)

The editor page currently has hardcoded `PROMPT`, `STARTER_CODE`, a hardcoded timer `"2:34"`, and "1 of 4 submitted". It uses an inline `<header>` not PhaseHUD.

**Files:**
- Modify: `frontend/src/app/editor/page.jsx`

- [ ] **Step 1: Add `"use client"` and the hook import**

At the very top of the file:

```js
"use client";
```

After the existing imports, add:

```js
import { useRound } from "@/lib/socket/useRound";
```

- [ ] **Step 2: Replace the mock constants with sensible fallbacks**

Delete these lines:

```js
const PROMPT = `Write a function that takes a list of integers and a target sum, and returns the indices of two numbers that add up to the target. Assume exactly one solution exists.`;

const STARTER_CODE = `def two_sum(nums, target):
    # Your code here
    seen = {}
    for i, x in enumerate(nums):
        complement = target - x
        if complement in seen:
            return [seen[complement], i]
        seen[x] = i
    return None
`;
```

Replace with:

```js
const FALLBACK_PROMPT = "Waiting for prompt…";
const FALLBACK_STARTER = "# write your solution here\n";
```

- [ ] **Step 3: Replace the component body**

Replace:

```js
export default function EditorDemo() {
  return (
```

With:

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

  // TODO: read the editor's current value to pass into submit().
  //       CodeEditor manages its own state internally — wiring this
  //       requires lifting state up via an onChange prop or imperative
  //       handle. For the stub, submit("") is used as a placeholder.
  const handleSubmit = () => {
    submit("").catch((err) => console.error("[editor] submit failed:", err));
  };

  const promptText = seed?.prompt ?? FALLBACK_PROMPT;
  const starterCode = seed?.code ?? FALLBACK_STARTER;
  const language = seed?.language ?? "python";
  const displayTimer =
    typeof secondsLeft === "number"
      ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
      : "—:—";
  const readyCount = `${submittedCount} of ${totalPlayers || "—"} submitted`;

  return (
```

- [ ] **Step 4: Update the JSX references**

Replace the existing title:

```jsx
title="Code Telephone — Round 1 — Write Phase"
```

With:

```jsx
title={`Code Telephone — Round ${roundNum ?? "—"} — Write Phase`}
```

Replace the hardcoded timer:

```jsx
<span className={styles.timerValue}>2:34</span>
```

With:

```jsx
<span className={styles.timerValue}>{displayTimer}</span>
```

Replace the prompt body:

```jsx
<p className={styles.promptText}>{PROMPT}</p>
```

With:

```jsx
<p className={styles.promptText}>{promptText}</p>
```

Replace the editor:

```jsx
<CodeEditor
  initialCode={STARTER_CODE}
  language="python"
  fileName="two_sum"
  height={380}
/>
```

With:

```jsx
<CodeEditor
  initialCode={starterCode}
  language={language}
  fileName="solution"
  height={380}
/>
```

Replace the ready count and submit button:

```jsx
<Button>Skip</Button>
<span className={styles.flex} />
<span className={styles.readyCount}>1 of 4 submitted</span>
<Button variant="primary">Submit</Button>
```

With:

```jsx
<Button>Skip</Button>
<span className={styles.flex} />
<span className={styles.readyCount}>{readyCount}</span>
<Button variant="primary" disabled={hasSubmitted} onClick={handleSubmit}>
  Submit
</Button>
```

---

## Task 4: Wire `app/describe/page.jsx` (Describe phase)

This page uses `PhaseHUD` (which has `onSubmit` and `timer`/`readyCount` props) and a Notepad for the input.

**Files:**
- Modify: `frontend/src/app/describe/page.jsx`

- [ ] **Step 1: Add `"use client"` and the hook import**

At the very top of the file:

```js
"use client";
```

After the existing imports, add:

```js
import { useRound } from "@/lib/socket/useRound";
```

- [ ] **Step 2: Replace the mock constants with fallbacks**

Delete these two declarations:

```js
/* The "obfuscated" two_sum — same logic Player A wrote, but Player B now
   sees it stripped of meaningful names. They have to infer the intent. */
const RECEIVED_CODE = `def f(a, t):
    s = {}
    for i, x in enumerate(a):
        c = t - x
        if c in s:
            return [s[c], i]
        s[x] = i
    return None
`;

const NOTEPAD_PLACEHOLDER = `In a sentence or two, describe what this function does.

The clearer your description, the more accurate the next player's reconstruction will be — but you can also describe it badly on purpose.`;
```

Replace with:

```js
const FALLBACK_CODE = "# waiting for the previous player's code…\n";
const NOTEPAD_PLACEHOLDER = "Describe what this function does in plain English.";
```

- [ ] **Step 3: Replace the component body**

Replace:

```js
export default function DescribeDemo() {
  return (
```

With:

```js
export default function DescribeDemo() {
  const {
    seed,
    secondsLeft,
    submittedCount,
    totalPlayers,
    hasSubmitted,
    submit,
  } = useRound();

  // TODO: read the Notepad's current value to pass to submit().
  //       Notepad manages its own state internally; wiring requires
  //       lifting state up. Placeholder for the stub.
  const handleSubmit = () => {
    submit("").catch((err) => console.error("[describe] submit failed:", err));
  };

  const receivedCode = seed?.code ?? FALLBACK_CODE;
  const language = seed?.language ?? "python";
  const displayTimer =
    typeof secondsLeft === "number"
      ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
      : "—:—";
  const readyCount = `${submittedCount} of ${totalPlayers || "—"} submitted`;

  return (
```

- [ ] **Step 4: Update the JSX references**

Replace the PhaseHUD:

```jsx
<PhaseHUD
  phaseIndex={2}
  phaseTotal={4}
  title="Describe the function"
  timer="1:47"
  readyCount="2 of 4 submitted"
  submitLabel="Submit description"
/>
```

With:

```jsx
<PhaseHUD
  phaseIndex={2}
  phaseTotal={4}
  title="Describe the function"
  timer={displayTimer}
  readyCount={readyCount}
  submitLabel="Submit description"
  onSubmit={handleSubmit}
/>
```

Replace the CodeEditor:

```jsx
<CodeEditor
  initialCode={RECEIVED_CODE}
  language="python"
  fileName="mystery"
  readOnly
  height={428}
  showStatusBar
/>
```

With:

```jsx
<CodeEditor
  initialCode={receivedCode}
  language={language}
  fileName="mystery"
  readOnly
  height={428}
  showStatusBar
/>
```

(Notepad usage stays the same — it already takes `placeholder={NOTEPAD_PLACEHOLDER}`.)

The `hasSubmitted` flag is not surfaced via PhaseHUD currently (it has no `disabled` prop). Add a TODO comment after the PhaseHUD JSX:

```jsx
{/* TODO: PhaseHUD does not currently accept a disabled prop. When wiring
    real submit, add `disabled` to PhaseHUD's submit button and pass
    `disabled={hasSubmitted}` here. */}
```

---

## Task 5: Wire `app/reimplement/page.jsx` (Reimplement phase)

Same pattern as describe — uses PhaseHUD, but the read-only panel is a Notepad and the editable panel is the CodeEditor.

**Files:**
- Modify: `frontend/src/app/reimplement/page.jsx`

- [ ] **Step 1: Add `"use client"` and the hook import**

At the very top of the file:

```js
"use client";
```

After the existing imports, add:

```js
import { useRound } from "@/lib/socket/useRound";
```

- [ ] **Step 2: Replace the mock constants with fallbacks**

Delete:

```js
/* What Player B (the describer) actually wrote, after staring at the
   obfuscated `def f(a, t)`. Slightly imprecise on purpose — that ambiguity
   is what makes the Telephone chain produce interesting reconstructions. */
const RECEIVED_DESCRIPTION = `Looks for two numbers in the input list that sum to a given target.

It uses a dictionary to keep track of which numbers we've already looked at and their positions. As it walks through the list, it checks whether the number we'd need to reach the target has already been seen — if yes, return where the matching pair lives in the list.

Nothing found = nothing returned.`;

/* Fresh editor — Player C hasn't started yet. The blank slate invites typing. */
const STARTER_CODE = `# write code here
`;
```

Replace with:

```js
const FALLBACK_DESCRIPTION = "Waiting for the previous player's description…";
const FALLBACK_STARTER = "# write your reconstruction here\n";
```

- [ ] **Step 3: Replace the component body**

Replace:

```js
export default function ReimplementDemo() {
  return (
```

With:

```js
export default function ReimplementDemo() {
  const {
    seed,
    secondsLeft,
    submittedCount,
    totalPlayers,
    hasSubmitted,
    submit,
  } = useRound();

  // TODO: read the CodeEditor's current value to pass to submit().
  //       CodeEditor manages its own state internally; placeholder used.
  const handleSubmit = () => {
    submit("").catch((err) => console.error("[reimplement] submit failed:", err));
  };

  const receivedDescription = seed?.description ?? FALLBACK_DESCRIPTION;
  const starterCode = seed?.code ?? FALLBACK_STARTER;
  const language = seed?.language ?? "python";
  const displayTimer =
    typeof secondsLeft === "number"
      ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
      : "—:—";
  const readyCount = `${submittedCount} of ${totalPlayers || "—"} submitted`;

  return (
```

- [ ] **Step 4: Update the JSX references**

Replace the PhaseHUD:

```jsx
<PhaseHUD
  phaseIndex={3}
  phaseTotal={4}
  title="Re-implement the function"
  timer="2:08"
  readyCount="0 of 4 submitted"
  submitLabel="Submit code"
/>
```

With:

```jsx
<PhaseHUD
  phaseIndex={3}
  phaseTotal={4}
  title="Re-implement the function"
  timer={displayTimer}
  readyCount={readyCount}
  submitLabel="Submit code"
  onSubmit={handleSubmit}
/>
```

Replace the read-only Notepad:

```jsx
<Notepad
  fileName="received"
  initialValue={RECEIVED_DESCRIPTION}
  readOnly
  x={56}
  y={88}
  width={440}
  height={460}
/>
```

With:

```jsx
<Notepad
  fileName="received"
  initialValue={receivedDescription}
  readOnly
  x={56}
  y={88}
  width={440}
  height={460}
/>
```

Replace the CodeEditor:

```jsx
<CodeEditor
  initialCode={STARTER_CODE}
  language="python"
  fileName="solution"
  height={428}
  showStatusBar
/>
```

With:

```jsx
<CodeEditor
  initialCode={starterCode}
  language={language}
  fileName="solution"
  height={428}
  showStatusBar
/>
```

Same TODO comment as describe re: PhaseHUD disabled prop:

```jsx
{/* TODO: PhaseHUD does not currently accept a disabled prop. When wiring
    real submit, add `disabled` to PhaseHUD's submit button and pass
    `disabled={hasSubmitted}` here. */}
```

---

## Task 6: Verify everything renders

Same approach as the lobby plan — the stubs do nothing, so verification is "dev server boots, all three round-phase routes render, no console errors related to the stubs."

- [ ] **Step 1: Start the dev server**

Run from the repo root:

```bash
cd frontend && npm run dev
```

Expected: Next.js banner with `Local: http://localhost:3000` (or 3001 if 3000 is in use). No build errors mentioning `lib/socket/round.js` or `useRound`.

- [ ] **Step 2: Verify each round-phase route returns HTTP 200**

```bash
curl -s -o /dev/null -w "/editor       HTTP %{http_code}\n" http://localhost:3000/editor
curl -s -o /dev/null -w "/describe     HTTP %{http_code}\n" http://localhost:3000/describe
curl -s -o /dev/null -w "/reimplement  HTTP %{http_code}\n" http://localhost:3000/reimplement
```

Expected: all three return `HTTP 200`.

(Substitute `:3001` if dev server is on 3001.)

- [ ] **Step 3: Spot-check the page content**

Open `http://localhost:3000/editor` in a browser:

- Window title reads `Code Telephone — Round — — Write Phase` (dash for missing round number).
- Prompt body shows `Waiting for prompt…`.
- Timer shows `—:—`.
- Submit button click logs `Error: not implemented` to the console; no crash.

Repeat for `/describe` and `/reimplement` — they should show fallback strings and stub-behaviour on submit.

- [ ] **Step 4: Stop the dev server**

Ctrl-C in the terminal running `npm run dev`.

---

## Final review (don't commit)

- [ ] **Step 1: Show the diff**

Run:

```bash
git -C /mnt/d/Documents/trainee-zeus-26t1 status
git -C /mnt/d/Documents/trainee-zeus-26t1 diff --stat
```

Expected unstaged changes:
- New files: `frontend/src/lib/socket/round.js`, `frontend/src/lib/socket/useRound.js`
- Modified: `frontend/src/app/editor/page.jsx`, `frontend/src/app/describe/page.jsx`, `frontend/src/app/reimplement/page.jsx`

- [ ] **Step 2: Hand off to the user**

Do NOT run `git add` or `git commit`. The user will stage and commit themselves. Summarize what was created and where the teammate should start (the open TODOs in each file, particularly the CodeEditor/Notepad value-extraction TODO that the teammate must resolve before submit will work).
