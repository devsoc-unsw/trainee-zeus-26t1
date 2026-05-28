# Code Telephone (Trainee Zeus 26t1)

A multiplayer code-telephone game built on Next.js + Supabase.

## Stack

- **Next.js 16** (App Router, TypeScript with `allowJs`, plain CSS Modules) — the whole app, deployed as one Vercel serverless app
- **Supabase Postgres** — single source of truth for room state. Writes go through Next.js Route Handlers with the service-role key; browsers get RLS-restricted read-only access
- **Supabase Realtime** (`postgres_changes`) — fan-out for room/player/submission updates; no WebSocket server of our own
- **Signed-cookie auth** — HMAC-SHA256 nickname + room code (`ct_player`), HttpOnly, SameSite=Lax, 24h. No Supabase Auth, no accounts

## Prerequisites

- Node ≥ 20
- A Supabase project (URL, anon key, service-role key)

## Setup

```bash
cp .env.example .env.local
# Fill in SUPABASE_*, NEXT_PUBLIC_SUPABASE_*, SESSION_SECRET

npm install
npm run dev
# http://localhost:3000
```

## Database

Apply migrations in numeric order in the Supabase SQL editor. Migrations
005, 010 (chain_scores_realtime), and 017 set up and then tear down the
old scoring system — applying them in order is still the correct path
for a fresh database; the tables are created and dropped along the way.

```
sql/001_base_schema.sql              ← rooms, players, prompts
sql/002_rooms_round_count.sql
sql/003_scoring_and_elo.sql          ← (dropped by 017)
sql/004_submissions_and_phases.sql   ← submissions + phase + seat_index
sql/005_chain_scores.sql             ← (dropped by 017)
sql/006_rls.sql                      ← RLS policies (read-only for clients)
sql/007_leave_room_proc.sql          ← leave_room RPC with host transfer
sql/008_realtime_publications.sql    ← supabase_realtime publication
sql/009_round_rpcs_and_realtime.sql  ← start_game / submit_turn / reset_game RPCs
sql/010_chain_scores_realtime.sql    ← (superseded by 017)
sql/010_no_prompt_seeding.sql        ← free-write round 1
sql/011_kick_player.sql              ← kick_player RPC
sql/012_players_replica_identity_full.sql
sql/013_replica_identity_full_remaining.sql
sql/014_widen_language_constraint.sql
sql/015_phase_started_at.sql         ← server-stamped phase timer
sql/016_prompts_enabled_toggle.sql   ← host setting: prompt seeding on/off
sql/017_drop_scoring_and_elo.sql     ← removes scoring/ELO subsystem
sql/018_terminate_room.sql           ← terminate_room RPC
sql/019_narrow_languages_to_3.sql
sql/020_phase_duration.sql           ← host setting: phase duration
sql/021_python_only.sql              ← DB CHECK constraint: python or NULL
sql/022_force_advance.sql            ← force_advance_timer + flush_phase RPCs
sql/023_kick_mid_game.sql            ← players.is_active + kick_player in-game soft-delete
sql/024_auto_end_on_solo.sql         ← auto-transition to reveal when active count ≤1 mid-game
sql/025_fix_update_room_settings_ambiguity.sql  ← unblocks lobby timing radio (qualified column refs)
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

# Required (browser-baked):
vercel env add NEXT_PUBLIC_SUPABASE_URL       production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY  production

# 4. Deploy.
vercel --prod
```

After `vercel --prod` succeeds, the CLI prints a `*.vercel.app` URL. Open it in two tabs (one normal + one incognito) and verify a 2-player game runs end-to-end.

### Preview deploys

`vercel` without `--prod` creates a preview deployment with its own URL. Useful for branch previews — each PR gets one automatically once the repo is linked to GitHub.

### Updating env vars after deploy

`vercel env rm <NAME> production` then re-add. The next deploy picks up the change. Server-only vars take effect immediately on the next request; `NEXT_PUBLIC_*` vars require a fresh build, so trigger one with `vercel --prod` or push a commit.

## Implementation history

The current codebase is the result of these plans / sweeps, all on `main`:

1. **Foundation** — repo hoist (Next.js to root), TS config, migrations 001–006, both Supabase clients
2. **Lobby** — signed-cookie identity, `/api/rooms` create/join/leave, Realtime hook, waiting-room screen
3. **Round mechanic** — PL/pgSQL RPCs (`start_game`, `submit_turn`, `reset_game`), seat math, editor / describe / reimplement / reveal screens
4. **Host controls & polish (2026-05-28)** — drop the AI-judge subsystem; collapse the FastAPI archive; phase timer + auto-submit; force-advance, kick, terminate, settings PATCH; lobby round-timing wired; draft autosave; Window resizable + viewport-clamped; mid-game kick (soft-delete + auto-end on solo); home-page rejoin via `/api/me`. See `docs/superpowers/handoffs/2026-05-28-cleanup-and-host-controls-handoff.md`.

A subsequent AI-judging + Judge0 layer was built between plans 3 and 4 and then removed (see migrations 005 / 010 / 017). The remaining `chain_scores` history is kept in `sql/` for archival reasons.

For higher-level architecture, see `docs/project-briefing.md` and `docs/build-status.md`.

## Roadmap / known gaps

Real features still to build (or finish) — none of these block the current demo, but they're the obvious next moves:

- **Server-side draft persistence** — drafts currently survive refresh via `lib/storage/drafts.js` (localStorage), but not cross-device. Adding a `drafts` table + endpoint would let a player continue on their phone.
- **Bots / spectators** — the waiting-room checkboxes are still local-only; no backend exists.
- **Mid-game leave** — `leave_room` (migration 007) hard-deletes the player; mirroring `kick_player`'s in-game soft-delete (migration 023) would prevent the chain math going wonky on a 4→3 mid-game leave. The auto-end-on-solo trigger (migration 024) dodges the worst case (everyone leaves down to 1) but the 4→3 case still has the issue.
- **Stray MenuBar / Superbar components** — `components/desktop/*` is no longer imported anywhere; safe to delete in a cleanup pass.
- **Reveal polish** — chain visualization is functional but could use animations, copy buttons on segments, etc.
