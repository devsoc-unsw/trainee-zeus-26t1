# Handoff — 2026-05-28 — Cleanup + Host Controls + Session Persistence

A long single-session sweep that cleaned up dead architecture, finished the host control surface, added rejoin / persistence, and tightened the docs. This handoff captures everything so the next session can pick up cold.

## Starting state (before this session)

- Local `main` was 6 commits behind `origin/main`. HEAD was `5c31fbc` ("hi", 7 days old).
- 21 untracked files locally:
  - 4 new admin API routes (`kick`, `terminate`, `force-advance`, `settings`) — all **broken at typecheck**: they imported functions from `@/lib/game/rooms` that didn't exist
  - `app/api/me/route.ts`, `lib/game/usePhaseTimer.js`
  - SQL migrations `010_no_prompt_seeding.sql` through `022_force_advance.sql` (13 files)
  - Stray `.antigravitycli/`, `frontend/` (just `node_modules/`)
- AI judging code (`lib/judge/`, `lib/judge0/`, `lib/game/judging.ts`, `app/api/judge/[roomId]/`) was still wired in even though migration 017 had dropped the `chain_scores` table — every judge call would have failed at runtime.
- `backend/` FastAPI archive still on disk (no `.py` source, just venvs + pycaches).
- Docs claimed "static UI only" two architectures behind, `docs/API.md` described the abandoned FastAPI surface, `README.md`'s migration list stopped at `010`.

## What shipped this session

In rough chronological order; each item is one or more commits on `main`.

### 1. Reset to a deployable baseline
- Identified the broken AI-judging path (the `chain_scores` table was dropped by `sql/017` but the JS still referenced it). Decided to remove the subsystem entirely rather than restore the table — the score wasn't pulling its weight in the game loop.

### 2. Removed AI judging + FastAPI residue (commit `e57cf60`)
- Deleted `lib/judge/`, `lib/judge0/`, `lib/game/judging.ts`, `app/api/judge/[roomId]/`
- Stripped `chain_scores` from `lib/realtime/useRoom.ts` (`ChainScoreRow` type, fetch, subscription) and the reveal page (score animation, ELO row, "AI judge" subtitle)
- Removed `GEMINI_API_KEY`, `JUDGE0_API_KEY`, `JUDGE0_API_HOST` from `.env.example` and the Vercel deploy doc
- Deleted `backend/` (no live source), the stray `frontend/` (just `node_modules/`), `docs/API.md` (entirely FastAPI), and the `legacy/` / `redesign/` ignores in `.gitignore` + `.dockerignore`
- Updated `docs/project-briefing.md` and `docs/README.md` to remove the FastAPI/Redis/Anthropic stack references

### 3. Wrote the 5 missing `lib/game/rooms.ts` wrappers (commit `a4920ae`)
- `kickPlayer`, `terminateRoom`, `forceAdvanceTimer`, `flushPhase`, `updateRoomSettings`
- Added a `parseRpcError` helper that maps PL/pgSQL `RAISE EXCEPTION 'CODE: msg'` strings to typed `GameError` instances by scanning known `ERROR_CODES`
- After this, all 4 previously-broken admin routes built cleanly

### 4. Removed top + bottom desktop chrome + made Window resizable (commit `c50665b`)
- `app/layout.jsx`: dropped `<MenuBar />` and `<Superbar />`. Just the wallpaper + the window-stack now.
- `components/window/Window.jsx`: width/height props become initial dimensions; internal `dims` state owns the live size. New `clampDims(w, h)` clamps to `viewport − 8px margin` (relaxes if viewport is smaller than the preferred minimums of 480×360). Added a bottom-right corner drag handle with `cursor: nwse-resize`. On viewport resize, both dims and position re-clamp. Maximize now fills the viewport instead of dodging chrome.
- `MenuBar` and `Superbar` source files **still exist** under `components/desktop/` but are no longer imported. Safe to delete in a cleanup pass; left in place for now.

### 5. Wired phase timer + host force-advance into the 3 game pages (commit `1cb16c6`)
- `lib/realtime/useRoom.ts`: extended `RoomRow` with `phase_started_at: string | null` and `phase_duration_seconds: number`
- `components/game/GameShell.jsx`: added `onForceAdvance` + `canForceAdvance` props; renders a "Skip phase (host)" ghost button next to Submit when both are truthy
- Each of editor/describe/reimplement: mount `usePhaseTimer(room?.phase_started_at, room?.phase_duration_seconds)`, pass the value to `<GameShell seconds={...}>`, and add a ref-guarded auto-submit `useEffect` that fires `handleSubmit()` once when `secondsLeft` hits 0 and the player hasn't already submitted. Force-advance handler POSTs to `/api/rooms/[code]/force-advance`.

### 6. Session persistence — draft autosave + home rejoin (commit `b7274d8`)
- New `lib/storage/drafts.js`: `loadDraft`, `saveDraft`, `clearDraft` keyed by `(code, round, phase)`. localStorage; gracefully no-ops if disabled/quota. Drafts older than 24h get culled on load.
- Each of editor/describe/reimplement: on `room?.id + round` becoming available, load the draft and pre-fill editor state; on change, debounced (600ms) save; on `hasSubmitted` flipping true (manual or auto), clear.
- `app/page.jsx`: `/api/me` check on mount. If the signed cookie maps to a live room + player, `router.replace()` straight to `routeForPhase(phase, code)`. While checking, suppress the wizard so it doesn't flash.
- `/api/me` route handler already existed — this just hooked it up.

### 7. Lobby kick UI (commit `59d2ecb`)
- Waiting room: small red "Kick" button on each non-host player row when viewer is host. `confirm()` → POST `/api/rooms/[code]/kick` (existing endpoint). Kicked player's tab notices their row vanish from `players` via Realtime and `replace("/")`s.
- This used the existing `kick_player` RPC's lobby-only branch (hard delete).

### 8. Wired lobby Round-timing radio to the settings PATCH (commit `d429f51`)
- `app/waiting-room/[code]/page.jsx`: derives `timing` from `room.phase_duration_seconds` instead of local state. `handleTimingChange()` PATCHes `/api/rooms/[code]/settings` with `phaseDurationSeconds: {90,180,300}`. The radio re-renders from server state via Realtime echo.
- Bots/spectators checkboxes remain local-only (no backend).

### 9. Mid-game kick (commit `318968c`, migration `023`)
- New migration `sql/023_kick_mid_game.sql`: adds `players.is_active boolean`. Rewrites `kick_player` so lobby is hard-delete (unchanged) and **in-game is soft-delete** (`is_active=false`) plus pre-fills empty submissions for every round the target would have authored, keyed by the existing seat math. This preserves `player_count` so the chain math doesn't get scrambled.
- `lib/realtime/useRoom.ts`: `PlayerRow.is_active?: boolean` (optional so pre-migration runtime is graceful)
- `/api/me` and `/api/rooms/[code]/me`: now `select('*')` and treat `is_active === false` as "gone" — 401 + clear cookie. The `*` makes it forward-safe if the column doesn't exist yet.
- `components/game/GameShell.jsx` PlayerRail: per-player `onKick` callback and `isInactive` flag. Hover-revealed `×` on non-self non-host non-inactive rows when viewer is host. Inactive players show greyed + line-through with a red "kicked" badge. "Players · {active} of {total}" reflects active count.
- editor/describe/reimplement pages: wire `handleKick` + per-player `onKick` builder. New self-kick `useEffect` that redirects home when `players.find(p => p.id === me.playerId)` is missing or `is_active === false`.

### 10. Terminate-room UI + remove LanguagePicker + delete ErrorToast (commit `bfeec7d`)
- Waiting room: new "End room (host)" ghost button alongside Leave / Start. `confirm()` → POST `/api/rooms/[code]/terminate`.
- `GameShell`: `onEndRoom` + `canEndRoom` props; renders next to Skip phase (host).
- editor/describe/reimplement: wire `handleEndRoom`.
- Removed `components/game/LanguagePicker.{jsx,module.css}` entirely; editor and reimplement now hardcode `language = "python"` and drop the picker from their seedBar / pane header.
- Removed dead `components/error/ErrorToast.{jsx,module.css}` (the audit had it as unmounted with stubbed null hooks).

### 11. Auto-end-on-solo (commit `d171642`, migration `024`)
- New migration `sql/024_auto_end_on_solo.sql`: `AFTER DELETE OR UPDATE OF is_active ON players` trigger calling `auto_end_if_solo()`. If room is in `status='active'` and `phase` isn't already `reveal`/`ended`, and active count drops to ≤1, sets `rooms.phase='reveal'` + stamps `phase_started_at`. The existing `useEffect` on `room.phase` carries clients into `/reveal/[code]` automatically — no client changes.
- The `UPDATE OF is_active` clause keeps the trigger from firing during `start_game`'s bulk `seat_index` assignment.

### 12. SQL bugfix: `update_room_settings` column ambiguity (commit `523826b`, migration `025`)
- User reported: clicking the Round-timing radio failed with `column reference "prompts_enabled" is ambiguous`.
- Root cause: migration 020 used `RETURNS TABLE(prompts_enabled boolean, ...)` (declaring OUT columns by that name) and then bare `prompts_enabled` inside `COALESCE` in the `UPDATE ... SET` clause. Postgres couldn't disambiguate between the OUT param and the table column.
- Fix: redefined the function with explicit `rooms.prompts_enabled` / `rooms.phase_duration_seconds` references inside the `COALESCE` and `WHERE`. Behaviour unchanged.

### 13. Migrations applied to live DB
After commits 9, 11, and 12, I psql'd 023 / 024 / 025 against the production Supabase via the `DATABASE_URI` the user pasted into `.env`. Verified with three checks:
- `players.is_active` column exists ✓
- `players_auto_end` trigger exists ✓
- `update_room_settings` 4-arg overload exists ✓

### 14. Documentation refresh (this commit)
- Updated `README.md` migration list to include 023–025; rewrote the Roadmap to reflect what's actually missing now
- Rewrote `docs/build-status.md` from a "static UI status" doc into an actual current-state inventory (routes, components, lib modules, migrations, what's not done)
- Updated `docs/project-briefing.md`: removed AI-judge from phase 4; reworked the stretch goals list; refreshed the "Current phase" section
- Updated `docs/ui-design.md`: dropped the "static UI only" framing; added a "what's shipped vs spec'd" table at the top of §3; updated screen mockups; replaced the old §5 file structure with a pointer to `build-status.md`
- Tweaked `docs/README.md`: removed the "out of date" note on build-status.md; added a pointer to this handoff dir

## Files touched / created this session

```
Code added:
+ sql/023_kick_mid_game.sql
+ sql/024_auto_end_on_solo.sql
+ sql/025_fix_update_room_settings_ambiguity.sql
+ lib/storage/drafts.js
+ docs/superpowers/handoffs/2026-05-28-cleanup-and-host-controls-handoff.md  (this file)
+ (committed-in: lib/game/usePhaseTimer.js, app/api/me/route.ts, the 4 admin routes, sql/010_no_prompt_seeding through sql/022_force_advance — these existed locally as untracked from prior work)

Code deleted:
- lib/judge/         (entire dir)
- lib/judge0/        (entire dir)
- lib/game/judging.ts (+ its test)
- app/api/judge/     (entire dir)
- components/error/ErrorToast.{jsx,module.css}
- components/game/LanguagePicker.{jsx,module.css}
- backend/           (FastAPI archive)
- frontend/          (stray node_modules)
- docs/API.md        (entirely stale FastAPI doc)

Code modified:
M lib/game/rooms.ts                       (+5 wrappers + parseRpcError)
M lib/realtime/useRoom.ts                 (+phase_started_at/_duration, +is_active; -chain_scores)
M lib/realtime/channels.ts                (-chainScoresChannel)
M components/window/Window.jsx + .module.css   (resize, viewport clamping, no chrome)
M components/game/GameShell.jsx + .module.css  (force-advance, end-room, per-player onKick, inactive style)
M app/layout.jsx                          (no MenuBar/Superbar)
M app/page.jsx                            (rejoin via /api/me)
M app/waiting-room/[code]/page.jsx        (kick, terminate, timing wired, settings PATCH)
M app/editor/[code]/page.jsx              (timer, autosubmit, force-advance, kick, terminate, draft autosave, python-only)
M app/describe/[code]/page.jsx            (same set of additions)
M app/reimplement/[code]/page.jsx         (same set of additions)
M app/reveal/[code]/page.jsx              (no more AI judge / score / ELO)
M app/api/me/route.ts                     (is_active check, graceful pre-migration)
M app/api/rooms/[code]/me/route.ts        (is_active check)
M tests/e2e/full-chain.spec.ts            (no judging assertions)
M README.md, docs/{README,project-briefing,build-status,ui-design}.md
M .env.example, .gitignore, .dockerignore
```

## Production state

- Vercel alias: `https://trainee-zeus-26t1.vercel.app` (auto-routes to whichever deployment is current)
- Last deploy: commit `d171642` (auto-end-on-solo + previous changes). Migration `025` was applied to Supabase but no code changes were needed for it, so no redeploy.
- Supabase migrations 023, 024, 025 are **applied** to the live database.

## What's left / known issues

### Functional gaps
- **Server-side draft persistence**. Drafts currently survive refresh via `lib/storage/drafts.js` (localStorage) but not cross-device. A `drafts` table + endpoint would let a player continue on their phone.
- **Mid-game leave parity**. `leave_room` (migration 007) still hard-deletes regardless of phase. If a player leaves mid-game but the room doesn't go solo (4→3), the chain math gets wonky because `player_count` decreased. Mirror what `kick_player` (migration 023) does — soft-delete + pre-fill — when `status='active'`.
- **Bots and spectators** UI checkboxes in the lobby are still cosmetic (no backend).
- **Reveal polish**. Functional but no animation, no copy buttons, etc. The chain visualization works.
- **`useMe` 401 handling on game pages**. If the cookie expires while a player is on a game page, `/api/rooms/[code]/me` returns 401 and `useMe` silently swallows it — the page renders with `me=null`. Should redirect to home or `/r/[code]`.

### Code hygiene
- **`components/desktop/`** (`MenuBar.jsx`, `Superbar.jsx`, `Clock.jsx`, `TaskbarItem.jsx`) — files exist but nothing imports them. Safe to delete.
- **`lib/languages.js`** still lists ~12 languages even though we're python-only. `CodeEditor` references it for syntax mode lookup. Harmless but could be trimmed.
- **`.env`** has a `SUPABASE_ACCESS_TOKEN` and `DATABASE_URI` that I (Claude) used for the migration run. Decide whether to keep them (handy for future migrations) or remove (less footprint). `DATABASE_URI` is needed for the psql workflow; if you'd rather use `claude mcp add supabase` for next session, the access token is the way.
- **AI-judge SQL history** is kept in `sql/005_chain_scores.sql` and `sql/010_chain_scores_realtime.sql`. Migration 017 drops what they create, so applying in order is still correct, but the historical files can be deleted if you don't care about the migration archive.

### Spec drift in docs
- `docs/ui-design.md` still describes components in §3 that were never built (`TintedWindow`, `Slider`, `NavOrb`, `StatusDot`, etc.). I added a table at the top of §3 marking what's shipped vs spec'd, but the per-component specs themselves remain — they're useful as a design vocabulary even if the React components don't exist.

## How to continue

1. **Run `git pull`** if continuing from a different machine (the most recent commit is `523826b` plus the doc-refresh commit you're about to make).
2. **Read this handoff doc** (you're doing that).
3. **Apply any new migrations** in Supabase. As of this handoff, 001–025 are applied. The user's preferred psql path:
   ```bash
   URL=$(sed -n 's/^DATABASE_URI=//p' .env)
   psql "$URL" -v ON_ERROR_STOP=1 -1 -f sql/NNN_<name>.sql
   ```
4. **Pick from the "What's left" list** above, or take fresh direction from the user.

## User preferences captured this session

- **No AI attribution in commit history.** I've been committing without the standard `Co-Authored-By: Claude` trailer since the user asked. Maintain this unless the user explicitly opts in.
- **Migrations applied via psql + `DATABASE_URI` in `.env`.** The user is comfortable with this workflow.
- **Deploy via `vercel --prod --yes`** using `/Users/andy/.nvm/versions/node/v18.20.8/bin/vercel` (project is already linked).
- **Direct, terse explanations.** The user picks options from `AskUserQuestion` and expects me to proceed without re-confirming once they've answered.
