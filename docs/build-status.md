# Code Telephone — Build Status

A snapshot of the current code surface. Useful for onboarding new contributors and as the single place to look up "is X built?".

For the **why** behind decisions, see [`project-briefing.md`](./project-briefing.md). For the visual system, see [`ui-design.md`](./ui-design.md).

---

## Routes

### Pages (Next.js App Router)

| URL | Source | What it does |
|---|---|---|
| `/` | `app/page.jsx` | Home wizard — 2 steps (nickname → create / join). Auto-redirects returning players via `/api/me` when a valid signed cookie exists. |
| `/r/[code]` | `app/r/[code]/page.jsx` | Static redirect to `/waiting-room/[code]` — used for shareable invite links. |
| `/waiting-room/[code]` | `app/waiting-room/[code]/page.jsx` | Lobby: player list (with host **Kick** button per non-host), Round-timing radio wired to the settings PATCH, **Start game** button (host, ≥2 players), **End room (host)**, **Leave room**. |
| `/editor/[code]` | `app/editor/[code]/page.jsx` | Write phase. Prompt panel + code editor. Submit button is required-input gated. Phase timer auto-submits on 0. Host can Skip phase / End room. |
| `/describe/[code]` | `app/describe/[code]/page.jsx` | Describe phase. Read-only code (left) + Notepad description editor (right). |
| `/reimplement/[code]` | `app/reimplement/[code]/page.jsx` | Reimplement phase. Read-only description (left) + code editor (right). |
| `/reveal/[code]` | `app/reveal/[code]/page.jsx` | Chain visualization — each chain rendered as a row of segments (avatar + label + preview), with the first vs last code laid out side-by-side. **Play again** button (host). |

### API routes (Next.js Route Handlers — TypeScript)

| Path | Method | Purpose |
|---|---|---|
| `/api/me` | GET | Whoami — used by `/` to auto-redirect returning players. Returns 401 + clears cookie on stale / kicked. |
| `/api/rooms` | POST | Create room (sets the host's signed cookie). |
| `/api/rooms/[code]/me` | GET | Per-room whoami: returns `{ playerId, roomId, seatIndex, isHost }`. |
| `/api/rooms/[code]/join` | POST | Join existing room by code. |
| `/api/rooms/[code]/leave` | POST | Leave room (transfers host if needed via `leave_room` RPC). |
| `/api/rooms/[code]/start` | POST | Host-only. Assigns seats and seeds round 0 prompts, then `phase='writing'`. |
| `/api/rooms/[code]/submit` | POST | Submit content for current round. |
| `/api/rooms/[code]/reset` | POST | Host-only. After reveal, returns room to lobby for **Play again**. |
| `/api/rooms/[code]/kick` | POST | Host-only. Hard-deletes in lobby; soft-deletes mid-game and pre-fills empty submissions (migration 023). |
| `/api/rooms/[code]/terminate` | POST | Host-only. Deletes the room (CASCADE deletes players + submissions). |
| `/api/rooms/[code]/force-advance` | POST | Host-only. Rewinds `phase_started_at` so clients auto-submit, then `flush_phase` fills in stragglers. |
| `/api/rooms/[code]/settings` | PATCH | Host-only. Lobby-only. Updates `prompts_enabled` and/or `phase_duration_seconds`. |

---

## Components

The desktop shell layer (top MenuBar, bottom Superbar) was **removed** in favour of just the wallpaper + window. The `MenuBar` and `Superbar` component files still exist under `components/desktop/` but aren't imported anywhere; they can be deleted in a cleanup pass.

### Window primitives
- **`Window`** (`components/window/Window.jsx`) — base draggable window. Aero title-bar gradient with macOS-style traffic-light controls on the left. Width/height start from props but are clamped to the viewport on mount, on viewport resize, and during user-driven resize (bottom-right corner drag handle). Double-click title bar to maximize.
- **`Notepad`** (`components/notepad/Notepad.jsx`) — Win7 Notepad recreation: page-icon, File/Edit/Format/View/Help menu (cosmetic), white plain-text body, status bar. `readOnly` variant.

### Surface
- **`GlassPanel`** — translucent Aero panel with crossed diagonal sheens.
- **`Bliss`** (`components/wallpaper/Bliss.jsx`) — recreates the Bliss wallpaper as the desktop background.
- **`CTLogo` / `CTLogoMark`** (`components/brand/`) — the Code Telephone wordmark + glyph used as window icons.

### Inputs
- **`Button`** — variants: `default`, `primary`, `danger`, `ghost`. Sizes: `sm`, `md`, `lg`. Loose Aero 3-stop grey gradient with a hover-overlay layer.
- **`Checkbox`**, **`Radio`**, **`TextField`**, **`TextArea`** — all match Aero spec.

### Game-specific
- **`CodeEditor`** — IDE chrome with a dark VS-Code-Dark+ body. Editable via textarea overlay. Tab inserts 4 spaces. Syntax highlighting via `lib/highlight.js`. Always python (DB constraint `sql/021`).
- **`GameShell`** — common layout for editor / describe / reimplement: PlayerRail (left sidebar with `×` kick button per player when host) + topbar (phase pill + timer) + content (per-page) + footer (ready count, **Skip phase (host)** / **End room (host)** / **Submit**).
- **`Pill`** — small status badge component, tone variants.
- **`PlayerAvatar`** — square avatar with colour seeded by name.
- **`Timer`** — countdown chip used in `GameShell`'s topbar.

### Theme
- **`ThemeProvider`** — `[data-theme="light|dark"]` on `<html>`. CSS custom properties switch per token map in `app/globals.css`.

---

## Lib modules

| File | Purpose |
|---|---|
| `lib/auth/session.ts` | Signed `ct_player` cookie helpers (HMAC-SHA256, HttpOnly, 24h). |
| `lib/game/codes.ts` | Room code generator + validator. |
| `lib/game/errors.ts` | `GameError` class + `ERROR_CODES` enum. |
| `lib/game/prompts.ts` | Seeded prompt selection helpers. |
| `lib/game/rooms.ts` | TypeScript wrappers around the PL/pgSQL RPCs: `createRoom`, `joinRoom`, `leaveRoom`, `kickPlayer`, `terminateRoom`, `forceAdvanceTimer`, `flushPhase`, `updateRoomSettings`. Includes a `parseRpcError` helper that maps `CODE: message` exceptions back to typed `GameError`. |
| `lib/game/round.ts` | `submitTurn` wrapper. |
| `lib/game/seating.ts` | `chainForPlayer(seatIndex, round, playerCount)` — owns the chain-index math. |
| `lib/game/usePhaseTimer.js` | 1Hz client tick off `rooms.phase_started_at` + `rooms.phase_duration_seconds`. Returns seconds-left or null. |
| `lib/highlight.js` | Hand-rolled regex tokenizer (Python keywords + builtins). |
| `lib/languages.js` | Language metadata used by `CodeEditor` for syntax mode lookup. |
| `lib/realtime/channels.ts` | Channel name helpers (`roomChannel`, `playersChannel`, `submissionsChannel`). |
| `lib/realtime/useRoom.ts` | Subscribes to `rooms`, `players`, `submissions` for a given room. Re-renders the calling component on any change. |
| `lib/storage/drafts.js` | localStorage-backed draft autosave keyed by `(code, round, phase)`. |
| `lib/storage/nickname.js` | localStorage nickname persistence. |
| `lib/supabase/browser.ts` | Anon-key client used in client components (RLS-restricted reads). |
| `lib/supabase/server.ts` | Service-role client used in route handlers (bypass RLS for writes). |

---

## Database

PostgreSQL on Supabase. 25 migrations live, applied in order (see the root [`README.md`](../README.md) for the full list with descriptions). Key bits:

- **Tables**: `rooms`, `players` (with `is_active` flag from migration 023), `submissions`, `prompts`. The `users`, `games`, `game_scores`, `elo_history`, and `chain_scores` tables from the scoring era were created (migrations 003 / 005) and later dropped (migration 017).
- **RPCs**: `start_game`, `submit_turn`, `reset_game`, `leave_room`, `kick_player`, `terminate_room`, `update_room_settings`, `force_advance_timer`, `flush_phase`. All `GRANT EXECUTE … TO service_role` and `REVOKE FROM PUBLIC` — anon clients never call RPCs directly.
- **Triggers**: `players_auto_end` (migration 024) — when active player count drops to ≤1 mid-game, sets `rooms.phase='reveal'`. Clients pick this up via Realtime and navigate to `/reveal/[code]`.
- **RLS**: read-only for anon clients (migration 006). All writes go through service-role from route handlers.
- **Realtime publication**: `rooms`, `players`, `submissions` are all in `supabase_realtime` (migrations 008, 009, 012, 013).

---

## Tests

- **Unit (Vitest)** — `lib/**/__tests__/*.test.ts` cover the lib surface (auth, codes, errors, prompts, rooms, round, seating, channels, supabase clients). Run with `npm test`.
- **E2E (Playwright)** — `tests/e2e/full-chain.spec.ts` is a 3-player smoke test that walks a complete game from create → join → write → describe → reimplement → reveal. Run with `npm run test:e2e` (after `npm run test:e2e:install` once).

---

## Design system

All tokens live in `app/globals.css` as CSS custom properties, extracted directly from the Aero UI source SVGs at [`./aero-reference/`](./aero-reference/). 60+ tokens covering:

- **Colours** — Win7 blues, button greys, close-button red ramp, checkbox/radio blues, glass whites
- **Gradients** — pre-computed multi-stop linear/radial values for buttons, title bars, close button, glass sheens, Bliss sky/hills
- **Typography** — `Segoe UI` for UI chrome, JetBrains Mono for code, sizes from 9px chrome labels up to 64px reveal numbers
- **Borders / radii / shadows** — including the `inset 0 1px 0 rgba(255,255,255,0.6)` top-highlight on glass panels
- **Themes** — light (default) and dark; switched via `[data-theme="dark"]` on `<html>`

See [`ui-design.md` §2](./ui-design.md) for the full token list and source citations.

---

## Architectural decisions worth knowing

- **TypeScript with `allowJs`.** Route handlers, lib code, and types are `.ts`. Pages and components remain `.jsx` for editor parity. `tsconfig.json` maps `@/*` to the repo root.
- **CSS Modules + CSS custom properties, no Tailwind, no CSS-in-JS.**
- **Hand-rolled syntax highlighter.** `lib/highlight.js` is a regex tokeniser. Currently python only (DB CHECK constraint from migration 021). Swap for Monaco when richer editing is needed.
- **Windows take initial dimensions via props, then own them as state.** Resize works via a bottom-right corner drag handle; viewport clamping happens both on initial layout and on every viewport resize event.
- **Aero reference SVGs are the source of truth for tokens.** When in doubt about a colour or gradient, open the SVG at `aero-reference/<component>.svg`.
- **Server-side authoritative state.** Browser writes go through Route Handlers using the service-role key. No client-side writes; RLS would block them anyway.
- **Phase transitions are server-driven.** `start_game`, `submit_turn`, `flush_phase`, and the `players_auto_end` trigger all update `rooms.phase`; Realtime fans the change; clients navigate via `routeForPhase`.

---

## What's not done yet

- **Server-side draft persistence** (currently localStorage only)
- **Mid-game leave parity with kick** — `leave_room` still hard-deletes; mid-game it should soft-delete (mirror migration 023)
- **Bots & spectators** — UI toggles are local-only, no backend
- **Sound effects** — Win7 chimes, etc.
- **`MenuBar` / `Superbar`** — components still present in `components/desktop/` but no longer imported; safe to delete
- **Stretch goals** in `project-briefing.md` (AI judge resurrection, cross-language chains, replay, ELO)

---

## File structure (repo root)

```
trainee-zeus-26t1/
├── app/
│   ├── globals.css                    ← design tokens + base resets
│   ├── layout.jsx                     ← root layout (ThemeProvider + Bliss + window-stack)
│   ├── page.{jsx,module.css}          ← Home wizard (with /api/me rejoin)
│   ├── r/[code]/page.jsx              ← invite-link redirect
│   ├── waiting-room/[code]/page.{jsx,module.css}
│   ├── editor/[code]/page.{jsx,module.css}
│   ├── describe/[code]/page.{jsx,module.css}
│   ├── reimplement/[code]/page.{jsx,module.css}
│   ├── reveal/[code]/page.{jsx,module.css}
│   └── api/
│       ├── me/route.ts
│       └── rooms/
│           ├── route.ts
│           └── [code]/
│               ├── me/route.ts
│               ├── join/route.ts
│               ├── leave/route.ts
│               ├── start/route.ts
│               ├── submit/route.ts
│               ├── reset/route.ts
│               ├── kick/route.ts
│               ├── terminate/route.ts
│               ├── force-advance/route.ts
│               └── settings/route.ts
├── components/
│   ├── brand/        CTLogo.{jsx,module.css}
│   ├── desktop/      (MenuBar, Superbar, Clock, TaskbarItem — unused, candidates for deletion)
│   ├── game/         CodeEditor, GameShell, Pill, PlayerAvatar, Timer
│   ├── glass/        GlassPanel
│   ├── input/        Button, Checkbox, Radio, TextField, TextArea
│   ├── notepad/      Notepad
│   ├── theme/        ThemeProvider
│   ├── wallpaper/    Bliss
│   └── window/       Window
├── lib/
│   ├── auth/         session.ts
│   ├── game/         codes, errors, prompts, rooms, round, seating, usePhaseTimer
│   ├── highlight.js
│   ├── languages.js
│   ├── realtime/     channels, useRoom
│   ├── storage/      drafts, nickname
│   └── supabase/     browser, server
├── sql/              001 … 025 (migrations)
├── tests/e2e/        full-chain.spec.ts
└── docs/             this folder
```
