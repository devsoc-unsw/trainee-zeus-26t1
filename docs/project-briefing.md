# Code Telephone — Project Briefing

## Overview

Code Telephone is a multiplayer browser game in the spirit of Gartic Phone, but built around code instead of drawing. A function passes through a chain of players, alternating between code and English, and the gap between the original and the reconstruction is laid bare at the end.

## The game loop

A round runs in four phases:

1. **Write** — Player A is given a written prompt and writes a function that satisfies it.
2. **Describe** — Player B receives only the function (the prompt is hidden) and must summarise in plain English what they think it does.
3. **Reimplement** — Player C receives only Player B's description and writes a new function based on it.
4. **Reveal** — The full chain is laid out side-by-side, segment by segment. Players read down the chain to see exactly where meaning was preserved or lost between the original prompt, the code, the description, and the reconstruction.

The fun lives in how the meaning warps between code and prose. A clean function with a misleading variable name will produce a wildly wrong reconstruction; a strong description can survive a sloppy intermediate.

## Stretch goals

The shipping v1 covers the chain and the reveal. Beyond that:

- **AI-judge semantic scoring** (previously built and then removed — see `sql/017_drop_scoring_and_elo.sql` for the deprecation reason). A future version could reintroduce a Gemini- or Claude-backed semantic similarity score so the reveal screen surfaces a number, not just a side-by-side diff.
- **Live code execution** through the Judge0 API, so a scoring layer could also run both functions against test inputs and use behavioural equivalence as a signal.
- **Spectator mode** where non-players can watch a round live.
- **ELO** per player so the chain has stakes across sessions (`sql/003_scoring_and_elo.sql` set up the tables; `sql/017` dropped them).
- **Cross-language chains**, currently constrained to Python by `sql/021_python_only.sql`.
- **Replay**, so after the reveal the whole chain can be stepped through animation-style.
- **Server-side draft persistence** so an in-progress submission survives moving to a different device. The current draft autosave is `localStorage` only (see `lib/storage/drafts.js`).

## Tech stack

| Layer | Choice |
|-------|--------|
| App | Next.js 16 (App Router, TypeScript with `allowJs`, plain CSS Modules) — frontend + API routes in a single Vercel deploy |
| Database | Supabase Postgres — single source of truth for room/player/submission state |
| Realtime | Supabase Realtime (`postgres_changes`) — fan-out for room/player/submission updates |
| Auth | Signed-cookie nickname + room code (HMAC-SHA256), HttpOnly, 24h — no accounts, no Supabase Auth |

An earlier draft of this brief proposed a split FastAPI/Redis/Anthropic-Claude stack. That was collapsed into the single Next.js + Supabase app above before any of those pieces were built, because Supabase Realtime gave us the live-state guarantee we'd been planning to write a WebSocket server for.

## Visual direction

The whole product runs inside a recreation of the Windows 7 desktop. This is the central design decision and everything else hangs off it.

The brief is to do Aero faithfully — not as a joke, not as winking nostalgia, but as a serious recreation that holds up to scrutiny from someone who actually used Windows 7. Every screen is a window with proper chrome. The Superbar is always present at the bottom. Glass surfaces have the right gradient bands and diagonal sheen. Buttons have the metallic mid-ledge that Win7 buttons had.

This direction does a few useful things at once:

- It gives the product a strong identity that nothing else on the web is doing right now.
- It makes the multiplayer state legible — every player's progress is a window taskbar item, and the desktop is the shared space.
- It maps naturally to the game's structure: each phase is a distinct window state, and transitions feel like opening and closing apps rather than navigating routes.

The detailed visual system — colour tokens, gradient stops extracted from the Aero source SVGs, per-component specs, and screen layouts — lives in [`ui-design.md`](./ui-design.md).

## Team

This is a DevSoc (UNSW Software Development Society) training project: two training leads and three trainees. Org GitHub at https://github.com/orgs/devsoc-unsw/repositories.

DevSoc's house stack is Next.js + TypeScript; this project sticks with that, hoisted into a single repo (no separate backend process).

## Constraints worth flagging

- **Scope is ambitious by design.** This isn't a weekend project; the chain, the realtime layer, and the polish on the UI all matter.
- **Postgres is the source of truth.** Browsers get RLS-restricted read-only access; all writes go through Next.js Route Handlers using the service-role key.
- **No untrusted code execution.** The game doesn't run player code anywhere — the round content is treated as text. (A previous design proposed Judge0 for behavioural scoring; that was removed along with the AI judge.)

## Current phase

The full round mechanic is shipped: a host can create a room, share the code, start the game when there are ≥2 players, and the room walks through write → describe → reimplement → reveal driven by `start_game` / `submit_turn` / `reset_game` PL/pgSQL RPCs. Each client subscribes via the `useRoom` Realtime hook and navigates automatically when `rooms.phase` changes.

Host controls (kick, terminate, force-advance, settings) and the per-phase server-stamped timer are also live (see the `/api/rooms/[code]/{kick,terminate,force-advance,settings}` route handlers and migrations 015 / 020 / 022 / 023). Draft autosave preserves in-progress text across refreshes via `localStorage` (`lib/storage/drafts.js`).

Design assets are limited to the Aero UI source SVGs at [`./aero-reference/`](./aero-reference/). All CSS is built from those.

For a snapshot of the actual surface (routes, components, lib modules, migrations), see [`build-status.md`](./build-status.md).
