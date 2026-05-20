# Handoff — Plans 1–4 done on main, redesign merged, Plan 5 drafted

**Date:** 2026-05-20
**Branch:** `main` (= `feature3`, both at `b0331f0`)
**Status:** Plans 1–4 fully executed and on main. Aero × Tahoe UI redesign merged in. Plan 5 (Judge0 + Vercel deploy + Playwright) is drafted but not yet executed. App is playable end-to-end via `npm run dev` once `SUPABASE_SERVICE_ROLE_KEY` is set.

## What's been built (cumulative)

The project went from "static UI only" to "playable demo with AI scoring" over 5 plans, all tracked under `docs/superpowers/plans/`.

| Plan | Doc | What it delivered | Status |
|---|---|---|---|
| 1 — Foundation | `2026-05-20-foundation.md` | Repo hoisted from `frontend/` to root, TS config (`allowJs: true`), Python backend archived to `legacy/backend/` (gitignored), 6 SQL migrations applied (001–006), both Supabase clients, README rewritten. | ✅ on main |
| 2 — Lobby | `2026-05-20-lobby.md` | Signed-cookie identity (`ct_player`), `POST /api/rooms` (create/join/leave), `lib/realtime/useRoom.ts`, dynamic `/waiting-room/[code]/` route, `/r/[code]` redirect, two-tab live lobby. | ✅ on main |
| 3 — Round mechanic | `2026-05-20-game-round-mechanic.md` | Three PL/pgSQL RPCs (`start_game`, `submit_turn`, `reset_game`), seat math, `/api/rooms/[code]/{start,submit,reset,me}`, four game screens moved to `[code]/` paths and wired to Realtime, full chain runs writing → describing → reimplementing → reveal. | ✅ on main |
| 4 — AI judging | `2026-05-20-ai-judging.md` | `lib/judge/gemini.ts` (direct fetch to gemini-2.5-flash), `lib/game/judging.ts` (judgeRoom orchestrator), `POST /api/judge/[roomId]` via `after()`, `chain_scores` Realtime, reveal page renders pending/done/failed score per chain. | ✅ on main |
| 5 — Judge0 + Deploy | `2026-05-20-judge0-and-deploy.md` | Behavioural test cases via Gemini → Judge0 RapidAPI → feedback into the judging prompt; Playwright 3-context smoke; Vercel deploy guide. | ❌ drafted only |

In parallel with Plan 4, a UI redesign branch (`feature3`) ported the Win7 Aero × macOS Tahoe styling across all routes. That branch was merged into `main` at commit `e7d0767` — the merged tree on main now uses redesign components (`GameShell`, `Pill`, `Timer`, `CTLogoMark`, `Wallpaper/Bliss`, `ThemeProvider`, redesigned Button/Window/Notepad) on the dynamic-route pages from Plan 3.

## Where the code lives

```
trainee-zeus-26t1/                                  ← Next.js project root
├── app/
│   ├── api/rooms/route.ts                          ← POST create
│   ├── api/rooms/[code]/{join,leave,me,start,submit,reset}/route.ts
│   ├── api/judge/[roomId]/route.ts                 ← POST fire-and-forget judging
│   ├── page.jsx                                    ← home wizard
│   ├── waiting-room/[code]/page.jsx
│   ├── editor/[code]/page.jsx
│   ├── describe/[code]/page.jsx
│   ├── reimplement/[code]/page.jsx
│   ├── reveal/[code]/page.jsx
│   └── r/[code]/page.jsx                           ← redirect to /waiting-room/[code]
├── components/
│   ├── brand/CTLogo.{jsx,module.css}               ← from feature3
│   ├── desktop/{Clock,StartOrb,Superbar,TaskbarItem,MenuBar}
│   ├── error/ErrorToast                            ← orphan, not mounted
│   ├── game/{CodeEditor,GameShell,LanguagePicker,PlayerAvatar,Pill,Timer}
│   ├── glass/GlassPanel
│   ├── input/{Button,Checkbox,Radio,TextArea,TextField}
│   ├── notepad/Notepad
│   ├── theme/ThemeProvider                          ← from feature3
│   ├── wallpaper/Bliss                              ← from feature3
│   └── window/Window
├── lib/
│   ├── auth/session.ts                             ← HMAC signed-cookie
│   ├── game/{errors,codes,seating,prompts,rooms,round,judging}.ts
│   ├── judge/gemini.ts
│   ├── realtime/{channels,useRoom}.ts
│   ├── storage/nickname.js                         ← localStorage
│   ├── supabase/{server,browser}.ts
│   ├── highlight.js + languages.js
│   └── (no lib/socket — deleted in Plan 2, no lib/judge0 yet — Plan 5)
├── sql/                                            ← 10 migrations, all applied to live DB
│   ├── 001_base_schema.sql
│   ├── 002_rooms_round_count.sql
│   ├── 003_scoring_and_elo.sql                     ← dormant: users/games/ELO
│   ├── 004_submissions_and_phases.sql
│   ├── 005_chain_scores.sql
│   ├── 006_rls.sql
│   ├── 007_leave_room_proc.sql
│   ├── 008_realtime_publications.sql               ← rooms + players
│   ├── 009_round_rpcs_and_realtime.sql             ← start/submit/reset + submissions
│   └── 010_chain_scores_realtime.sql               ← chain_scores
├── docs/superpowers/{specs,plans,handoffs}/
├── legacy/backend/                                 ← gitignored, the Python stack
└── redesign/                                       ← out of scope per spec
```

`frontend/` is empty (was hoisted in Plan 1). `node_modules/` lives at the root. Vitest config is `vitest.config.ts`; Playwright config (Plan 5) doesn't exist yet.

## Branch state

| Branch | Head | Synced with origin? | What it contains |
|---|---|---|---|
| `main` | `b0331f0` | ✅ pushed | Plans 1–4 + redesign + Plan 5 doc |
| `feature3` | `b0331f0` | ✅ pushed (= main) | same commit as main |
| `nextjs_merge` | `ec6c1e8` | ✅ pushed | Plans 1–4 only, no redesign, no Plan 5 doc — frozen at end of Plan 4 |
| `main` (origin) | `b0331f0` | — | published |
| Stale teammate branches (`ai-scoring`, `error-ui`, `feat/*`) | various | varies | predate the rewrite; treat as historical |

`main` is now the canonical working branch. `nextjs_merge` is 3 commits behind and could be deleted or fast-forwarded; it served its purpose as the feature branch during Plans 1–4 execution.

## What's on Supabase

Project: **`tqxdsjuxiljsmcqkjxxt`** in org **`Team_Zeus`** (`rpatitgoeymytmfdsogn`).

All 10 SQL migrations applied. Realtime publication includes `rooms`, `players`, `submissions`, and `chain_scores`. The three RPCs (`start_game`, `submit_turn`, `reset_game`, `leave_room`) are present and granted to `service_role`. RLS allows `SELECT` to the anon role; all writes require service-role.

Schema highlights:
- `rooms(id, code, host_id, status, phase, current_round, round_count, ...)`
- `players(id, name, room_id, is_host, seat_index, created_at)` — `socket_id` was dropped
- `submissions(id, room_id, round_num, chain_index, author_id, round_type, content, language, created_at)` — `UNIQUE(room_id, round_num, chain_index)`
- `chain_scores(room_id, chain_index, status, overall_score, notes, updated_at)` — PK `(room_id, chain_index)`
- Dormant: `users`, `games`, `game_scores`, `elo_history` (created in 003 for the eventual ELO/accounts feature)

The seed `prompts` table has 5 rows; the demo needs at least N rows for an N-player game (`start_game` enforces this).

## Env vars

`.env` at the repo root (gitignored) holds these (all confirmed present except where noted):

| Var | Required for | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser anon client | ✅ set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser anon client | ✅ set |
| `SUPABASE_URL` | server service-role client | ✅ set |
| `SUPABASE_SERVICE_ROLE_KEY` | server service-role client | ✅ set (route handlers will throw without it) |
| `SESSION_SECRET` | signing `ct_player` cookies | ✅ set (32 bytes base64) |
| `GEMINI_API_KEY` | AI judging in Plan 4 | ✅ set |
| `SUPABASE_ACCESS_TOKEN` | Management API (running migrations, ad-hoc SQL) | ✅ set (PAT scoped to Andy's whole account; Team_Zeus is the only project in scope — see memory) |
| `JUDGE0_API_KEY` | Plan 5 behavioural scoring | ❌ unset (Plan 5 designs around this — `runCases` returns `[]` cleanly when missing) |
| `JUDGE0_API_HOST` | Plan 5 | optional, defaults to `judge0-ce.p.rapidapi.com` |

`.env.example` mirrors this list (with placeholder values).

## How to run the app locally

```bash
npm install                  # Node ≥ 20
npm run dev                  # http://localhost:3000
```

A real game needs at least 2 isolated browser contexts (cookies are HttpOnly per-context). Easiest: one regular tab + one incognito window. For Plan 5's smoke test that wants 3, Chrome profiles work.

For the Docker path: `docker compose up --build` brings up a single Next.js container with the bind-mount hot-reload setup. Plan 1 rewrote both files for the single-Next stack; the old FastAPI service is gone.

## Test surface

| Layer | How | Tests |
|---|---|---|
| Pure functions (seating, codes, errors) | Vitest | unit |
| Game logic with mocked Supabase (rooms, round, judging) | Vitest | unit |
| Auth (HMAC sign/verify, cookie helpers) | Vitest | unit |
| Realtime channel helpers | Vitest | unit |
| Route handlers (all 7) | Vitest, mocks `getServiceClient` and `lib/game/*` boundaries | unit |
| Gemini client | Vitest, mocks `fetch` | unit |
| Realtime fan-out + multi-tab game flow | Manual two/three-tab walk | currently manual; Plan 5 Task 6 adds Playwright |

Suite: **103 tests across 19 files, all passing** at `b0331f0`. `npx tsc --noEmit` clean. `vitest.config.ts` has a 15s `testTimeout` because dynamic-import parallelism can run slow under WSL.

## Andy's preferences (live)

These have been load-bearing across the session and are saved as memory:

1. **No AI-attributed git activity by default.** Andy committed and pushed everything himself for Plan 1 and most of Plan 2. Partway through Plan 2 he granted explicit session-level permission for me to commit + push, and we've operated that way since — but the default outside an explicit ask is still "stop and wait for Andy."
2. **Only touch the Team_Zeus Supabase org.** The PAT in `.env` sees three orgs (`0randa's Org`, `Team_Zeus`, `devsoc_halftime_hack`). Only `rpatitgoeymytmfdsogn` (Team_Zeus) is in scope. See `feedback_supabase_scope.md`.
3. **Demo posture over production.** No CSRF tokens, no rate limiting, signed-cookie nickname instead of Supabase Auth, single language hard-coded to Python in submissions, no ELO/replays. Don't reintroduce these without asking.
4. **TS permissively.** `allowJs: true`, `strict: false`, `checkJs: false`. Tighten file-by-file as you touch files, not in a big-bang conversion. `.jsx` for pages is fine; new lib/* files default to `.ts`.

## What's known to be working

End-to-end as of `b0331f0`:
- Home wizard creates or joins a room.
- Two browser contexts join and see each other live in the lobby.
- Host clicks Start; all clients navigate to `/editor/[code]` via Realtime `phase` flip.
- Players submit code → all advance to `/describe/[code]`.
- Players submit description → advance to `/reimplement/[code]`.
- Players submit code → advance to `/reveal/[code]`.
- `/reveal/[code]` POSTs `/api/judge/[roomId]` once; judgeRoom calls Gemini per chain; scores stream in via Realtime.
- "Play again" (host only) resets the room to lobby.

Verified pieces from this session's smoke runs:
- `POST /api/rooms` → 200 with `set-cookie: ct_player=...` (Plan 2).
- `POST /api/rooms/[code]/join` → 200 with new cookie + hostId in body (Plan 2).
- RLS denies anon writes; allows SELECT (Plan 2 task 8).
- `start_game` RPC raises `ROOM_NOT_FOUND` cleanly on a dummy UUID (Plan 3 Task 1 fix verified).
- Curl-driven create + join + start over the real route handlers works against live Supabase (Plan 3 Task 15).

## What's not done yet

- **Plan 5 execution.** Doc is committed; the 8 tasks are unexecuted:
  - `lib/judge/test-cases.ts` (Gemini → assert snippets)
  - `lib/judge0/run.ts` (Judge0 RapidAPI client)
  - Extend `judgeChain` with `testResults`
  - Wire Judge0 into `judgeRoom` with graceful fallback
  - Install `@playwright/test` + `playwright.config.ts`
  - `tests/e2e/full-chain.spec.ts`
  - Expand the README "Deploy to Vercel" section
  - Verify exit criteria
- **Two-tab / three-tab smoke against the redesigned UI.** The redesign was ported onto the new dynamic-route paths during the `feature3` merge; the redesigned screens have not been visually validated by a human in this session. Worth eyeballing each phase screen before Plan 5.
- **`SUPABASE_SERVICE_ROLE_KEY`** has been set in local `.env` but **not in any deployed environment** — Vercel deploy config is Plan 5 Task 7.
- **No deploy URL yet.** Vercel link + deploy is Plan 5.

## Known risks and gaps

- **Vercel 60s serverless ceiling.** `judgeRoom` runs sequentially per chain; ~5 chains × ~8s Gemini = ~40s. Single chain over 60s = whole judging job fails on Pro tier. If this bites, split into per-chain endpoints and have the client kick off N parallel POSTs.
- **The redesign deleted `PhaseHUD` and `ScoreNumber`.** The new pages on main use `GameShell` for chrome and an inline score panel on reveal; no other file should reference the deleted components.
- **Cosmetic settings on `/waiting-room/[code]`.** "Round timing" radio, "fill with bots", "allow spectators" — all non-functional UI carried over from the redesign. Wire later or remove.
- **Draft autosave gone.** Plan 2 deleted `lib/socket/session.js`; Plans 3–5 never rebuilt the per-(roomId, round) draft persistence. Players who refresh mid-round lose their current draft.
- **`@playwright/test` not installed**; `tests/e2e/` doesn't exist. Plan 5 Task 5 is the install.
- **No `lib/judge0/`** anywhere yet. Plan 5 Task 2.
- **The merge into `feature3` was a manual port** (Plans 3/4 had moved game pages to `[code]/page.jsx`; feature3's UI redesign was on the old paths). Visual issues may surface during the redesign smoke that need fixing — e.g. `GameShell`'s `players` prop expects `{name, you, status, statusText}`; my port maps from the real `players` array but the status enum may not exactly match what `GameShell` styles.

## How to resume Plan 5

The recommended path (from the plan's "Execution Handoff" section):

```
Invoke superpowers:subagent-driven-development.
Use docs/superpowers/plans/2026-05-20-judge0-and-deploy.md as the source.
```

Task 1 is the simplest start (a new `lib/judge/test-cases.ts` with TDD); Task 5 (install Playwright) is heavier because of browser binary download (`npx playwright install chromium --with-deps`, ~200MB one-time on the host machine). Task 7 (Vercel deploy guide) is a README edit; Task 8 (verify) is run-time validation Andy does manually.

Each Plan 5 task is graceful — if `JUDGE0_API_KEY` is left unset, `runCases` returns `[]` and `judgeRoom` falls back to Plan 4's code-only path. So Plan 5 can be shipped without anyone signing up for Judge0; the demo still works as-is.

## Files to read for full context

| File | Why |
|---|---|
| `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md` | Locked architectural decisions and rationale |
| `docs/superpowers/plans/2026-05-20-foundation.md` through `2026-05-20-judge0-and-deploy.md` | The five implementation plans |
| `docs/superpowers/handoffs/2026-05-20-nextjs-merge-handoff.md` | The session-start handoff (now superseded by this one) |
| `README.md` | User-facing setup |
| `.env.example` | Env var inventory |
| `~/.claude/projects/-mnt-d-Documents-trainee-zeus-26t1/memory/MEMORY.md` | Saved feedback + scope memories |

## Suggested next message to start picking this up

> Read `docs/superpowers/handoffs/2026-05-20-post-plan4-handover.md`. The app is playable end-to-end on `main` once `SUPABASE_SERVICE_ROLE_KEY` is in `.env`. Plan 5 (`docs/superpowers/plans/2026-05-20-judge0-and-deploy.md`) is drafted but unexecuted — execute it via `superpowers:subagent-driven-development`, OR start with a 2-tab smoke against the redesigned UI to surface any visual issues from the `feature3` merge port.
