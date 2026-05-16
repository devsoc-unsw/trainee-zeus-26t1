# Reveal Screen Static UI — Design

**Date:** 2026-05-16
**Status:** Approved, ready for implementation
**Scope:** Build the `/reveal` route + supporting components following `docs/ui-design.md §4.4`. Same pattern as the existing static UI pages: full layout renders, wired to `useRound()`, fallbacks for missing data, no animations or real-time polish.

**Related:** Subsystem #4 of the "game logic stubs" series. Subsystems #1 (round networking), #2 (AI judge), #3 (ELO persistence) complete. This subsystem closes the loop — when a game ends, the player has somewhere to land.

## Goal

Render the round-reveal screen as static UI: chain visualization, original-vs-reconstructed diff, score pill, ELO row, and footer buttons. Reads from `useRound()` when game data is present; falls back to mock data so the page is dev-inspectable from the empty default state.

## Scope

**In:**
- New route `app/reveal/page.jsx` + `page.module.css`
- New component `components/game/ScoreNumber.jsx` + `ScoreNumber.module.css`
- One-line addition to `useRound()` to expose `reset` (bound to `round.js:resetGame`)
- Mock-data fallback so `/reveal` is reachable in dev without a real game ending

**Out (deferred):**
- Chain-to-chain navigation (v1 shows only `chains[0]`)
- Score count-up animation
- "View replay" button behavior (depends on a future replay subsystem)
- ELO row real wiring (depends on subsystem #3 + backend protocol additions)
- Window open/close transition
- Auto-navigation when `game:reveal` arrives (depends on a top-level router yet to be designed)

## File Structure

```
frontend/src/
├── app/reveal/
│   ├── page.jsx                ← NEW: "use client", reads useRound()
│   └── page.module.css         ← NEW
└── components/game/
    ├── ScoreNumber.jsx         ← NEW: per ui-design.md §3.13
    └── ScoreNumber.module.css  ← NEW
```

`<ChainRow>` and the ELO row are inline in `page.jsx` — page-specific layout, not reusable. `<ScoreNumber>` is split because it's a named primitive in `ui-design.md §3.13` and may be reused later (leaderboards, replay).

## Page Layout

Faithful to `docs/ui-design.md §4.4`:

```
┌─ Code Telephone — Round Reveal ───────────── _ □ X ─┐
│                                                     │
│  The chain                                          │
│  ┌──────┐  →  ┌──────┐  →  ┌──────┐  →  ┌──────┐    │
│  │ [JS] │     │ [AM] │     │ [LK] │     │  ✦   │    │
│  │ Code │     │ Desc │     │ Code │     │Score │    │
│  └──────┘     └──────┘     └──────┘     └──────┘    │
│                                                     │
│  ┌──────────────────────┬──────────────────────┐    │
│  │ ORIGINAL (Jordan)    │ RECONSTRUCTED (Lukas)│    │
│  │ <code editor RO>     │ <code editor RO>     │    │
│  └──────────────────────┴──────────────────────┘    │
│                                                     │
│              ┌───────────────────┐                  │
│              │       87%         │  ← <ScoreNumber> │
│              │  semantic match   │                  │
│              └───────────────────┘                  │
│                                                     │
│  ELO   Jordan +8    Amrita +12    Lukas -4          │
│                                                     │
│                       [ View replay ]  [ Play again ]│
└─────────────────────────────────────────────────────┘
```

Window: 900 × 700, centered.

## Data Sources

| UI element | Source | Fallback when source is null |
|---|---|---|
| Window title (room code) | `useRound()` doesn't currently expose `roomCode` — use a static title for now | `"Code Telephone — Round Reveal"` |
| Chain nodes (player avatars + role labels) | `useRound().chains[0]` segments (focal chain) | Mock 3-player chain |
| Original code | `chains[0].segments[0].content` | Mock Python `reverse_string` |
| Reconstructed code | last `code`-type segment | Mock Python `flip` |
| Original / reconstructed author names | `chains[0].segments[0].authorName`, `segments[last].authorName` | `"Jordan"`, `"Lukas"` |
| Score percentage | `useRound().chains[0]` joined with scores by `chainIndex`, multiplied by 100 | Pill shows `"—"` with `"Score pending"` sub-label |
| ELO row | **Not yet in protocol** | Static `"Jordan +? Amrita +? Lukas +?"` row, with a TODO comment in JSX that this hydrates from a future protocol field |
| "Play again" button onClick | `useRound().reset()` | (stub throws; caught and logged — same pattern as other actions) |
| "View replay" button onClick | None (future replay subsystem) | No-op with `console.log("TODO: replay")` |

**Focal chain choice:** v1 shows only `chains[0]`. Chain navigation is deferred.

## New Components

### `<ScoreNumber value={number | null} suffix="%" subLabel="semantic match">`

Per `ui-design.md §3.13`:

- Pill-shaped container (tinted glass treatment via existing tokens)
- Big number: `var(--fs-score)` (56px), weight 700, `font-variant-numeric: tabular-nums`
- Optional `suffix` rendered next to the number at the same baseline (smaller font)
- Optional `subLabel` rendered below in small caps
- When `value === null`: render `"—"` instead of the number; `subLabel` becomes `"Score pending"` regardless of prop
- No animation — just static display

**Props:**
```js
{
  value: number | null,
  suffix?: string,        // default "%"
  subLabel?: string,      // default "semantic match"
}
```

### `<ChainRow>` (inline in `page.jsx`)

A simple horizontal flex layout:
- One block per segment + one final score block
- Each segment block: PlayerAvatar (initials derived from authorName) + small label ("Code" / "Desc")
- Arrows (SVG or `→` glyph) between blocks
- The final block is a star/glyph (`✦`) with label "Score"

Not extracted into its own component — too page-specific.

## Hook Addition: expose `reset`

Currently `useRound()` returns: `{status, roundNum, roundType, seed, secondsLeft, hasSubmitted, submittedCount, totalPlayers, chains, error, submit}`.

Add `reset: () => Promise<void>` to the return shape, bound to `round.js:resetGame`. In the stub state, it throws "not implemented" when invoked.

**Spec change to `useRound.js`:**

```js
return {
  // ...existing fields unchanged...
  reset: async () => {
    throw new Error("not implemented");
  },
};
```

Update the JSDoc return type to include the new field.

## Fallback Strategy

When `chains` is null (the stub state of `useRound`), the page renders **mock data** so it's always dev-inspectable. Same pattern as the round-phase pages had with `PROMPT` / `STARTER_CODE` constants before subsystem #1.

Mock data lives at the top of `page.jsx` with clearly labeled `MOCK_` constants and a comment explaining it's the dev-time fallback.

## Routing

The reveal route is reachable directly at `/reveal` for dev/preview. When the backend sends `game:reveal`, the implemented `useRound()` would set `status === "reveal"`, and a top-level navigator (out of scope) would push to `/reveal`. The stub doesn't auto-navigate.

## Acceptance

- `/reveal` returns HTTP 200 in `npm run dev`, no compile errors, no React runtime errors.
- With `useRound()` returning empty state (stub default), the page renders the mock data layout.
- With `useRound()` populated (real game data), the page renders the focal chain.
- "Play again" button click calls `reset()` which throws "not implemented" — caught and logged via `.catch(console.error)`. No crash.
- Layout matches `ui-design.md §4.4` (single chain, side-by-side code, score pill, ELO row, footer).
- New components don't break any existing route (`/`, `/waiting-room`, `/editor`, `/describe`, `/reimplement`).
