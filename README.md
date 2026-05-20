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

## Deploy

```bash
npx vercel link
npx vercel env add SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SESSION_SECRET GEMINI_API_KEY JUDGE0_API_KEY JUDGE0_API_HOST
npx vercel --prod
```

## Plans

Implementation plans live in `docs/superpowers/plans/`. This codebase is the result of:

1. `2026-05-20-foundation.md` — repo merge + schema (this plan)
2. Lobby + room lifecycle (Plan 2)
3. Game mechanic + AI judge (Plan 3)
4. Judge0 + deploy polish (Plan 4)

The source design spec is `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md`.
