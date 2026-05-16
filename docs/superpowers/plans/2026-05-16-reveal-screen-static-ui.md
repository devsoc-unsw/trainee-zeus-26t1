# Reveal Screen Static UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/reveal` route with chain visualization, original-vs-reconstructed diff, score pill, ELO row, and footer buttons. Static UI only — wired to `useRound()` with mock-data fallback. Layout follows `docs/ui-design.md §4.4`.

**Architecture:** One new route under `app/reveal/`, one new reusable component (`ScoreNumber`). Page reads `useRound()` and falls back to module-level `MOCK_*` constants when `chains` is null (so dev-time inspection works without a real game). `useRound` gains one new field (`reset`) bound to `round.js:resetGame`.

**Tech Stack:** Next.js 16 App Router, plain JavaScript (`.jsx`), CSS Modules, existing design tokens from `frontend/src/app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-05-16-reveal-screen-static-ui.md`

**Commit policy:** Do not auto-commit. Leave changes unstaged.

---

## File Map

- **Modify:** `frontend/src/lib/socket/useRound.js` — add `reset` to the returned object + update JSDoc
- **Create:** `frontend/src/components/game/ScoreNumber.jsx` — score pill component
- **Create:** `frontend/src/components/game/ScoreNumber.module.css` — styles for the pill
- **Create:** `frontend/src/app/reveal/page.jsx` — the route
- **Create:** `frontend/src/app/reveal/page.module.css` — page-specific layout

---

## Task 1: Add `reset` to `useRound()`

**Files:**
- Modify: `frontend/src/lib/socket/useRound.js`

- [ ] **Step 1: Update the JSDoc return type**

Find the existing JSDoc return block. Replace this line:

```js
 *   submit:         (content: string) => Promise<void>,
 * }}
```

With:

```js
 *   submit:         (content: string) => Promise<void>,
 *   reset:          () => Promise<void>,
 * }}
```

- [ ] **Step 2: Update the returned object**

Find this block at the end of the function:

```js
    submit: async (_content) => {
      throw new Error("not implemented");
    },
  };
}
```

Replace with:

```js
    submit: async (_content) => {
      throw new Error("not implemented");
    },
    reset: async () => {
      // TODO: bind to `round.js:resetGame()` once the hook is implemented.
      throw new Error("not implemented");
    },
  };
}
```

- [ ] **Step 3: Verify the file parses**

```bash
node --check /mnt/d/Documents/trainee-zeus-26t1/frontend/src/lib/socket/useRound.js && echo "useRound.js: PARSE OK"
```

Expected: `useRound.js: PARSE OK`.

---

## Task 2: Create `<ScoreNumber>` component

**Files:**
- Create: `frontend/src/components/game/ScoreNumber.jsx`
- Create: `frontend/src/components/game/ScoreNumber.module.css`

- [ ] **Step 1: Write `ScoreNumber.module.css`**

```css
.pill {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 28px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 1px 4px rgba(0, 0, 0, 0.08);
}

.row {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  color: var(--text-on-glass);
  font-family: var(--font-ui);
  font-weight: var(--fw-bold, 700);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.number {
  font-size: var(--fs-score, 56px);
}

.suffix {
  font-size: calc(var(--fs-score, 56px) * 0.45);
}

.subLabel {
  margin-top: 6px;
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Write `ScoreNumber.jsx`**

```jsx
import styles from "./ScoreNumber.module.css";

/**
 * Big score pill used on the reveal screen. Per docs/ui-design.md §3.13.
 *
 * @param {object} props
 * @param {number|null} props.value      - The number to display. `null` → "—".
 * @param {string}      [props.suffix]    - Defaults to "%".
 * @param {string}      [props.subLabel]  - Small caps label below. Defaults
 *                                          to "semantic match". When `value`
 *                                          is null, the sub-label is forced
 *                                          to "Score pending".
 */
export default function ScoreNumber({
  value,
  suffix = "%",
  subLabel = "semantic match",
}) {
  const displayNumber = value === null || value === undefined ? "—" : String(value);
  const displaySub = value === null || value === undefined ? "Score pending" : subLabel;
  const showSuffix = value !== null && value !== undefined;

  return (
    <div className={styles.pill}>
      <span className={styles.row}>
        <span className={styles.number}>{displayNumber}</span>
        {showSuffix && <span className={styles.suffix}>{suffix}</span>}
      </span>
      <span className={styles.subLabel}>{displaySub}</span>
    </div>
  );
}
```

- [ ] **Step 3: Verify the file parses**

```bash
# Node doesn't parse JSX natively, so defer JSX parse check to Task 4 dev server boot.
echo "skip parse check; verified in Task 4"
```

---

## Task 3: Create the reveal page

**Files:**
- Create: `frontend/src/app/reveal/page.jsx`
- Create: `frontend/src/app/reveal/page.module.css`

- [ ] **Step 1: Write `page.module.css`**

```css
.stage {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 32px 16px 80px;  /* bottom padding clears the Superbar */
}

.body {
  padding: 20px 24px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--text-on-glass);
  font-family: var(--font-ui);
  font-size: var(--fs-body, 12px);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sectionTitle {
  margin: 0;
  font-size: var(--fs-section, 14px);
  font-weight: var(--fw-semibold, 600);
}

/* ── Chain row ─────────────────────────────────────────────── */
.chain {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  overflow-x: auto;
}

.chainNode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 88px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 6px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.chainScoreNode {
  /* same shape, but tinted */
  background: rgba(210, 230, 248, 0.85);
}

.chainNodeLabel {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.chainNodeName {
  font-size: 11px;
  font-weight: var(--fw-semibold, 600);
}

.chainStar {
  font-size: 18px;
  color: var(--w7-blue-500, #2a7ab8);
}

.chainArrow {
  flex-shrink: 0;
  color: var(--w7-blue-500, #2a7ab8);
  font-size: 18px;
  user-select: none;
}

/* ── Diff panel ────────────────────────────────────────────── */
.diff {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.diffPanel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diffHeader {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.diffHeader strong {
  color: var(--text-on-glass);
  text-transform: none;
  letter-spacing: normal;
  font-weight: var(--fw-semibold, 600);
  margin-left: 4px;
}

/* ── Score ─────────────────────────────────────────────────── */
.scoreWrap {
  display: flex;
  justify-content: center;
  padding: 6px 0 2px;
}

/* ── ELO row ───────────────────────────────────────────────── */
.eloRow {
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
}

.eloLabel {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.eloItem {
  font-size: var(--fs-body, 12px);
}

.eloName {
  font-weight: var(--fw-semibold, 600);
  margin-right: 4px;
}

.eloPositive {
  color: var(--status-done, #3a9a5c);
}

.eloNegative {
  color: var(--status-danger, #d94f3d);
}

.eloUnknown {
  color: var(--text-muted);
}

/* ── Footer ────────────────────────────────────────────────── */
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}
```

- [ ] **Step 2: Write `page.jsx`**

```jsx
"use client";

import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import CodeEditor from "@/components/game/CodeEditor";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import ScoreNumber from "@/components/game/ScoreNumber";
import { useRound } from "@/lib/socket/useRound";
import styles from "./page.module.css";

/* ──────────────────────────────────────────────────────────────────
   Mock data — used when `useRound()` returns the empty default
   shape (e.g. opening /reveal directly during dev). Real game data
   replaces this once useRound is wired up.
   ────────────────────────────────────────────────────────────────── */
const MOCK_CHAIN = {
  startPlayerId: "p-jordan",
  startPlayerName: "Jordan",
  segments: [
    {
      roundNum: 1,
      roundType: "code",
      authorId: "p-jordan",
      authorName: "Jordan",
      content:
        "def reverse_string(s):\n    return s[::-1]\n",
    },
    {
      roundNum: 2,
      roundType: "describe",
      authorId: "p-amrita",
      authorName: "Amrita",
      content:
        "Takes a string and returns the same string with its characters in reverse order.",
    },
    {
      roundNum: 3,
      roundType: "code",
      authorId: "p-lukas",
      authorName: "Lukas",
      content:
        "def flip(text):\n    return text[::-1]\n",
    },
  ],
};

const MOCK_SCORE_PERCENT = 87;

// TODO: ELO row hydrates from a future protocol field — for now this is
// static placeholder data so the layout is reviewable.
const MOCK_ELO = [
  { name: "Jordan", delta: 8 },
  { name: "Amrita", delta: 12 },
  { name: "Lukas", delta: -4 },
];

function initialsOf(name) {
  if (!name) return "??";
  return name.slice(0, 2).toUpperCase();
}

function roleLabelOf(roundType) {
  if (roundType === "code") return "Code";
  if (roundType === "describe") return "Desc";
  return "?";
}

function eloClassOf(delta, stylesRef) {
  if (delta == null) return stylesRef.eloUnknown;
  if (delta > 0) return stylesRef.eloPositive;
  if (delta < 0) return stylesRef.eloNegative;
  return stylesRef.eloUnknown;
}

function eloFormatOf(delta) {
  if (delta == null) return "?";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export default function RevealPage() {
  const { chains, reset } = useRound();

  // Pick the focal chain. Real games: chains[0]. Stub state: mock.
  const chain = chains && chains.length > 0 ? chains[0] : MOCK_CHAIN;
  const usingMock = !(chains && chains.length > 0);

  const segments = chain.segments;
  const originalSegment = segments[0];
  // Reconstructed = the last `code`-type segment (write/reimplement phases).
  const reconstructedSegment =
    [...segments].reverse().find((s) => s.roundType === "code") ?? segments[segments.length - 1];

  const scorePercent = usingMock ? MOCK_SCORE_PERCENT : null;
  const elo = usingMock
    ? MOCK_ELO
    // TODO: hydrate from protocol once subsystem #3 wires ELO into game:reveal.
    : MOCK_ELO.map((p) => ({ name: p.name, delta: null }));

  const handlePlayAgain = () => {
    reset().catch((err) => console.error("[reveal] reset failed:", err));
  };

  const handleReplay = () => {
    // TODO: open the replay subsystem (not yet defined).
    console.log("[reveal] view replay — not implemented");
  };

  return (
    <div className={styles.stage}>
      <Window title="Code Telephone — Round Reveal" width={900} height={700}>
        <div className={styles.body}>
          {/* ── Chain row ──────────────────────────────────────── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>The chain</h2>
            <div className={styles.chain}>
              {segments.map((seg, i) => (
                <ChainNodeFragment key={`seg-${i}`} segment={seg} isFirst={i === 0} />
              ))}
              <span className={styles.chainArrow} aria-hidden>→</span>
              <div className={`${styles.chainNode} ${styles.chainScoreNode}`}>
                <span className={styles.chainStar} aria-hidden>✦</span>
                <span className={styles.chainNodeLabel}>Score</span>
              </div>
            </div>
          </section>

          {/* ── Diff panel ─────────────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.diff}>
              <div className={styles.diffPanel}>
                <span className={styles.diffHeader}>
                  Original<strong>({originalSegment.authorName})</strong>
                </span>
                <CodeEditor
                  initialCode={originalSegment.content}
                  language="python"
                  fileName="original"
                  readOnly
                  height={220}
                  showStatusBar={false}
                />
              </div>
              <div className={styles.diffPanel}>
                <span className={styles.diffHeader}>
                  Reconstructed<strong>({reconstructedSegment.authorName})</strong>
                </span>
                <CodeEditor
                  initialCode={reconstructedSegment.content}
                  language="python"
                  fileName="reconstructed"
                  readOnly
                  height={220}
                  showStatusBar={false}
                />
              </div>
            </div>
          </section>

          {/* ── Score ──────────────────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.scoreWrap}>
              <ScoreNumber value={scorePercent} suffix="%" subLabel="semantic match" />
            </div>
          </section>

          {/* ── ELO row ────────────────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.eloRow}>
              <span className={styles.eloLabel}>ELO</span>
              {elo.map((p) => (
                <span key={p.name} className={styles.eloItem}>
                  <span className={styles.eloName}>{p.name}</span>
                  <span className={eloClassOf(p.delta, styles)}>{eloFormatOf(p.delta)}</span>
                </span>
              ))}
            </div>
          </section>

          {/* ── Footer ─────────────────────────────────────────── */}
          <footer className={styles.footer}>
            <Button onClick={handleReplay}>View replay</Button>
            <Button variant="primary" onClick={handlePlayAgain}>
              Play again
            </Button>
          </footer>
        </div>
      </Window>
    </div>
  );
}

/* ── Inline helper: render one chain node + its trailing arrow ─────────── */
function ChainNodeFragment({ segment }) {
  return (
    <>
      <div className={styles.chainNode}>
        <PlayerAvatar
          initials={initialsOf(segment.authorName)}
          seed={segment.authorName}
        />
        <span className={styles.chainNodeName}>{segment.authorName}</span>
        <span className={styles.chainNodeLabel}>{roleLabelOf(segment.roundType)}</span>
      </div>
      <span className={styles.chainArrow} aria-hidden>→</span>
    </>
  );
}
```

- [ ] **Step 3: Spot-check that imports resolve**

Examine the imports to confirm each path exists (these are checked at dev-server boot, but a manual scan now catches typos early):

```bash
ls /mnt/d/Documents/trainee-zeus-26t1/frontend/src/components/window/Window.jsx \
   /mnt/d/Documents/trainee-zeus-26t1/frontend/src/components/input/Button.jsx \
   /mnt/d/Documents/trainee-zeus-26t1/frontend/src/components/game/CodeEditor.jsx \
   /mnt/d/Documents/trainee-zeus-26t1/frontend/src/components/game/PlayerAvatar.jsx \
   /mnt/d/Documents/trainee-zeus-26t1/frontend/src/components/game/ScoreNumber.jsx \
   /mnt/d/Documents/trainee-zeus-26t1/frontend/src/lib/socket/useRound.js
```

Expected: all six paths listed without "No such file" errors.

---

## Task 4: Verify dev server + show diff

- [ ] **Step 1: Start the dev server**

```bash
cd /mnt/d/Documents/trainee-zeus-26t1/frontend && npm run dev
```

Expected: Next.js banner; ready on http://localhost:3000 (or 3001 if 3000 in use). No build errors mentioning `app/reveal/`, `ScoreNumber`, or `useRound`.

- [ ] **Step 2: Curl the new route + existing routes**

```bash
curl -s -o /dev/null -w "/             HTTP %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "/waiting-room HTTP %{http_code}\n" http://localhost:3000/waiting-room
curl -s -o /dev/null -w "/editor       HTTP %{http_code}\n" http://localhost:3000/editor
curl -s -o /dev/null -w "/describe     HTTP %{http_code}\n" http://localhost:3000/describe
curl -s -o /dev/null -w "/reimplement  HTTP %{http_code}\n" http://localhost:3000/reimplement
curl -s -o /dev/null -w "/reveal       HTTP %{http_code}\n" http://localhost:3000/reveal
```

Expected: all six return HTTP 200. (Adjust port if dev server bound to 3001.)

- [ ] **Step 3: Spot-check `/reveal` rendering**

Open `http://localhost:3000/reveal` in a browser. Verify:

- Window chrome renders with title "Code Telephone — Round Reveal"
- "The chain" row shows 3 player nodes (Jordan / Amrita / Lukas) + a Score node
- Two read-only code editors side by side (original / reconstructed)
- Big "87%" score pill
- ELO row shows Jordan +8 (green), Amrita +12 (green), Lukas -4 (red)
- "View replay" and "Play again" buttons in the footer
- Clicking "Play again" logs `Error: not implemented` to the console (caught by `.catch`); no crash
- Clicking "View replay" logs `[reveal] view replay — not implemented`; no crash

- [ ] **Step 4: Stop the dev server**

Ctrl-C the `npm run dev` terminal.

---

## Final review (don't commit)

- [ ] **Step 1: Show the diff**

```bash
git -C /mnt/d/Documents/trainee-zeus-26t1 status
git -C /mnt/d/Documents/trainee-zeus-26t1 diff --stat
```

Expected:
- Modified: `frontend/src/lib/socket/useRound.js`
- New: `frontend/src/app/reveal/page.jsx`, `frontend/src/app/reveal/page.module.css`, `frontend/src/components/game/ScoreNumber.jsx`, `frontend/src/components/game/ScoreNumber.module.css`

(Plus the spec and plan docs in `docs/superpowers/`.)

- [ ] **Step 2: Hand off**

Do NOT run `git add` or `git commit`. The user reviews and commits manually. Summarize:

- `/reveal` route now exists and renders with mock data when the hook returns empty (dev-time inspectable).
- When the teammate wires `useRound()` to receive real `chains` from `game:reveal`, the page hydrates automatically — `chain = chains?.length ? chains[0] : MOCK_CHAIN`.
- Open items for the teammate (search for `TODO` in the new files): hydrate ELO from a future protocol field, implement the replay view, decide on chain navigation if more than one chain should be browsable.
