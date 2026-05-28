# Code Telephone (Trainee Zeus 26t1)

A multiplayer code-telephone game built on Next.js + Supabase.

## Stack

- **Next.js 16** (App Router, TypeScript with `allowJs`, plain CSS Modules) — the whole app, deployed as one Vercel serverless app
- **Supabase Postgres** — single source of truth for room state. Writes go through Next.js Route Handlers with the service-role key; browsers get RLS-restricted read-only access
- **Supabase Realtime** (`postgres_changes`) — fan-out for room/player/submission/score updates; no WebSocket server of our own
- **Signed-cookie auth** — HMAC-SHA256 nickname + room code (`ct_player`), HttpOnly, SameSite=Lax, 24h. No Supabase Auth, no accounts
- **Google Gemini 2.5 Flash** — AI judge that scores how well each reconstructed function matches the original (called via `fetch`, no SDK)
- **Judge0** (optional) — sandboxed code execution for behavioural scoring on top of the semantic score. Disabled if `JUDGE0_API_KEY` is unset

## Prerequisites

- Node ≥ 20
- A Supabase project (URL, anon key, service-role key)

## Setup

```bash
cp .env.example .env.local
# Fill in SUPABASE_*, NEXT_PUBLIC_SUPABASE_*, SESSION_SECRET, GEMINI_API_KEY
# Optional: JUDGE0_API_KEY (+ JUDGE0_API_HOST) to enable behavioural scoring

npm install
npm run dev
# http://localhost:3000
```

## Database

Apply migrations in order in the Supabase SQL editor:

```
sql/001_base_schema.sql              ← rooms, players, prompts
sql/002_rooms_round_count.sql
sql/003_scoring_and_elo.sql          ← dormant tables (users/games/ELO) — see Roadmap
sql/004_submissions_and_phases.sql   ← submissions + phase + seat_index
sql/005_chain_scores.sql             ← chain_scores
sql/006_rls.sql                      ← RLS policies (read-only for clients)
sql/007_leave_room_proc.sql          ← leave_room RPC with host transfer
sql/008_realtime_publications.sql    ← supabase_realtime publication
sql/009_round_rpcs_and_realtime.sql  ← start_game / submit_turn / reset_game RPCs
sql/010_chain_scores_realtime.sql    ← chain_scores in realtime publication
```

## Tests

```bash
npm test          # one-shot
npm run test:watch
```

## Deploy to Vercel

One-time setup per environment (prod, preview):

```bash
# 1. Install the Vercel CLI globally OR use npx.
npm i -g vercel

# 2. Link the repo to a Vercel project (interactive — prompts for org + project).
#    Pick "Link to existing project" if your team already created one in the
#    Vercel dashboard; otherwise "Create new project". Framework auto-detect
#    should land on Next.js.
vercel link

# 3. Set environment variables. The browser-baked NEXT_PUBLIC_* vars must be
#    set at build time, so add them BEFORE deploying. Use the CLI or paste
#    into the dashboard's "Environment Variables" tab.

# Required (server-only — never expose to the browser):
vercel env add SUPABASE_URL                production
vercel env add SUPABASE_SERVICE_ROLE_KEY   production
vercel env add SESSION_SECRET              production
vercel env add GEMINI_API_KEY              production

# Required (browser-baked):
vercel env add NEXT_PUBLIC_SUPABASE_URL       production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY  production

# Optional (Judge0 behavioural scoring — leave unset to skip):
vercel env add JUDGE0_API_KEY   production
vercel env add JUDGE0_API_HOST  production   # default: judge0-ce.p.rapidapi.com

# 4. Deploy.
vercel --prod
```

After `vercel --prod` succeeds, the CLI prints a `*.vercel.app` URL. Open it in two tabs (one normal + one incognito) and verify a 2-player game runs end-to-end.

### Preview deploys

`vercel` without `--prod` creates a preview deployment with its own URL. Useful for branch previews — each PR gets one automatically once the repo is linked to GitHub.

### Updating env vars after deploy

`vercel env rm <NAME> production` then re-add. The next deploy picks up the change. Server-only vars take effect immediately on the next request; `NEXT_PUBLIC_*` vars require a fresh build, so trigger one with `vercel --prod` or push a commit.

## Implementation history

The current codebase is the result of five plans, all on `main`:

1. **Foundation** — repo hoist (Next.js to root), TS config, archive the FastAPI backend, migrations 001–006, both Supabase clients
2. **Lobby** — signed-cookie identity, `/api/rooms` create/join/leave, Realtime hook, waiting-room screen
3. **Round mechanic** — PL/pgSQL RPCs (`start_game`, `submit_turn`, `reset_game`), seat math, editor / describe / reimplement / reveal screens
4. **AI judging** — Gemini integration, `POST /api/judge/[roomId]` via `after()`, streaming `chain_scores` on the reveal page
5. **Judge0 + deploy** — behavioural scoring, Playwright e2e smoke test, Vercel deploy docs

For higher-level architecture and the original design rationale, see `docs/project-briefing.md`, `docs/ui-design.md`, and `docs/API.md`.

## Roadmap / known gaps

Real features still to build (or finish) — none of these block the current demo, but they're the obvious next moves:

- **ELO** — `elo_history` table from migration 003 is dormant; the reveal screen shows an ELO panel with placeholder `—` rows
- **Per-phase timers** — `rooms.phase_ends_at` is reserved in the schema but never advanced; rounds are currently host-paced
- **Draft autosave** — lost when the old WebSocket layer was removed; editor needs a periodic save back to Supabase
- **Language picker** — UI is wired but cosmetic; all submissions hard-coded to Python for the demo
- **Waiting-room settings** — round timing / bots / spectators toggles are non-functional placeholders
