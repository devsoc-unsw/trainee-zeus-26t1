# Code Telephone (Trainee Zeus 26t1)

A multiplayer code-telephone game built on Next.js + Supabase.

## Stack

- **Next.js 16** (App Router, TypeScript, plain CSS Modules) — the whole app
- **Supabase** — Postgres for state, Realtime for fan-out
- **Google Gemini** — AI judge (added in Plan 3)
- **Judge0** — optional code execution (added in Plan 4)

The old FastAPI backend lives under `legacy/backend/` (gitignored) and is no longer deployed.

## Prerequisites

- Node ≥ 20
- A Supabase project (URL, anon key, service-role key)

## Setup

```bash
cp .env.example .env.local
# Fill in SUPABASE_*, NEXT_PUBLIC_SUPABASE_*, SESSION_SECRET, GEMINI_API_KEY

npm install
npm run dev
# http://localhost:3000
```

## Database

Apply migrations in order in the Supabase SQL editor:

```
sql/001_base_schema.sql
sql/002_rooms_round_count.sql
sql/003_scoring_and_elo.sql        ← dormant tables (users/games/ELO)
sql/004_submissions_and_phases.sql ← submissions + phase + seat_index
sql/005_chain_scores.sql           ← chain_scores
sql/006_rls.sql                    ← RLS policies (read-only for clients)
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

## Plans

Implementation plans live in `docs/superpowers/plans/`. This codebase is the result of:

1. `2026-05-20-foundation.md` — repo merge + schema (this plan)
2. Lobby + room lifecycle (Plan 2)
3. Game mechanic + AI judge (Plan 3)
4. Judge0 + deploy polish (Plan 4)

The source design spec is `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md`.
