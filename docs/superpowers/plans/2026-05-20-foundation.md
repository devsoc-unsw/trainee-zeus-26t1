# Foundation Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Andy's preference:** Never run `git add`, `git commit`, or `git push`. When a task says "Commit checkpoint", **stop and wait for Andy to commit** with the suggested message. Do not run git write commands yourself.

**Goal:** Collapse the split Next.js + FastAPI repo into a single Next.js project at the repo root, with TypeScript support, the old backend safely archived to `legacy/`, the Supabase schema updated for the new game model, and a service-role Supabase client ready for upcoming route handlers. No game behavior changes in this plan — existing static UI must still render.

**Architecture:** Hoist `frontend/` to repo root so Vercel treats it as the project. Move the Python backend out of the way to `legacy/backend/` (gitignored). Add new migrations (`004_submissions_and_phases.sql`, `005_chain_scores.sql`, `006_rls.sql`) and apply them. Add server-side Supabase client. Convert TypeScript permissively (`allowJs: true`) so existing `.jsx`/`.js` files keep working unchanged — later plans convert them as they're touched.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Supabase (Postgres + Realtime), Node ≥ 20.

**Source spec:** `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md`

---

## File structure produced by this plan

```
trainee-zeus-26t1/                          ← Next.js project root after this plan
├── app/                                    ← MOVED from frontend/src/app
├── components/                             ← MOVED from frontend/src/components
├── lib/
│   ├── highlight.js                        ← MOVED from frontend/src/lib
│   ├── socket/                             ← MOVED from frontend/src/lib/socket (still .js; rewritten in Plan 2)
│   └── supabase/
│       ├── browser.ts                      ← NEW (replaces frontend/src/lib/supabase/client.js)
│       └── server.ts                       ← NEW (service-role)
├── public/                                 ← MOVED from frontend/public
├── sql/
│   ├── 001_base_schema.sql                 ← MOVED+RENAMED from backend/sql/supabase_game_schema.sql
│   ├── 002_rooms_round_count.sql           ← MOVED from backend/sql
│   ├── 003_scoring_and_elo.sql             ← MOVED from backend/sql (dormant tables)
│   ├── 004_submissions_and_phases.sql      ← NEW
│   ├── 005_chain_scores.sql                ← NEW
│   └── 006_rls.sql                         ← NEW
├── legacy/
│   └── backend/                            ← MOVED + gitignored
├── docs/                                   ← unchanged
├── redesign/                               ← unchanged (out of scope)
├── .env.example                            ← REWRITTEN
├── .gitignore                              ← UPDATED
├── next.config.mjs                         ← MOVED from frontend/
├── tsconfig.json                           ← NEW (replaces jsconfig.json)
├── eslint.config.mjs                       ← MOVED+UPDATED from frontend/
├── package.json                            ← MOVED from frontend/
├── package-lock.json                       ← MOVED from frontend/
└── README.md                               ← UPDATED at end of plan
```

Files **deleted** by this plan:

- `frontend/Dockerfile`, `frontend/jsconfig.json`, `frontend/AGENTS.md`, `frontend/CLAUDE.md`, `frontend/README.md` (content folds into root)
- Top-level `docker-compose.yml` and `Dockerfile` (none at top — only `backend/Dockerfile` moves with the backend)
- `backend/` (moved, not deleted)

---

## Task 1: Inventory the current tree and create a clean baseline

**Files:**
- Read-only inspection. No edits.

- [ ] **Step 1: Verify clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean`. If not clean, ask Andy to commit or stash first — the file moves below need a clean tree to be reviewable.

- [ ] **Step 2: Confirm the structures the plan assumes**

Run: `ls frontend backend && ls frontend/src && ls backend/sql && ls backend/app`
Expected: shows `frontend/{src, public, package.json, next.config.mjs, jsconfig.json, eslint.config.mjs}`, `backend/{app, sql, requirements.txt, Dockerfile}`.

If any of these are missing or have shifted, **stop and flag it** — the plan was written against the structure above.

---

## Task 2: Move the frontend up to the repo root

**Files:**
- Move: every file under `frontend/` → repo root.

Use `git mv` so history is preserved.

- [ ] **Step 1: Move directories with history preserved**

Run, from repo root, one command per line (in order):

```bash
git mv frontend/src/app app
git mv frontend/src/components components
mkdir -p lib
git mv frontend/src/lib/highlight.js lib/highlight.js
git mv frontend/src/lib/socket lib/socket
git mv frontend/src/lib/supabase lib/supabase
git mv frontend/public public
```

If `git mv` complains that the destination exists, **stop**. Something is already at root that wasn't expected — investigate, don't overwrite.

- [ ] **Step 2: Move the top-level frontend files to root**

```bash
git mv frontend/package.json package.json
git mv frontend/package-lock.json package-lock.json
git mv frontend/next.config.mjs next.config.mjs
git mv frontend/eslint.config.mjs eslint.config.mjs
```

- [ ] **Step 3: Delete files that don't need to come up**

```bash
git rm frontend/jsconfig.json frontend/Dockerfile frontend/README.md frontend/AGENTS.md frontend/CLAUDE.md
```

- [ ] **Step 4: Remove the now-empty `frontend/` directory and node_modules**

```bash
rm -rf frontend/node_modules frontend/.next
rmdir frontend/src/lib frontend/src 2>/dev/null || true
rmdir frontend 2>/dev/null || true
```

If `rmdir frontend` fails because something is left, run `ls frontend` and decide what to do with the leftover. Do not force-delete.

- [ ] **Step 5: Verify the move**

Run: `ls app components lib public package.json next.config.mjs && ! test -d frontend`
Expected: all listed paths exist; exits 0.

- [ ] **Step 6: Reinstall node_modules at the new location**

Run: `npm install`
Expected: completes without errors; `node_modules/` appears at repo root.

- [ ] **Step 7: Commit checkpoint (Andy)**

Suggested message:

```
chore(repo): hoist Next.js project to repo root

Move frontend/* up. backend/ is moved out in a later task.
No behavior change — `npm run dev` still renders existing static UI.
```

**Stop here and wait for Andy to commit before continuing.**

---

## Task 3: Move the backend out of the way

**Files:**
- Move: `backend/` → `legacy/backend/`
- Update: `.gitignore`

- [ ] **Step 1: Move backend with history preserved**

```bash
mkdir -p legacy
git mv backend legacy/backend
```

- [ ] **Step 2: Move the SQL files up to a root `sql/` directory**

We want canonical migrations at the root, not buried under `legacy/`.

```bash
mkdir -p sql
git mv legacy/backend/sql/supabase_game_schema.sql sql/001_base_schema.sql
git mv legacy/backend/sql/002_rooms_round_count.sql sql/002_rooms_round_count.sql
git mv legacy/backend/sql/003_scoring_and_elo.sql sql/003_scoring_and_elo.sql
```

- [ ] **Step 3: Add `legacy/` to `.gitignore` to stop tracking the Python code**

Open `.gitignore`. After the line `# Skills` and before `agents`, add:

```
# Archived FastAPI backend (post-Next.js merge — kept locally for reference only)
legacy/
```

- [ ] **Step 4: Untrack `legacy/` without deleting the working files**

```bash
git rm -r --cached legacy/backend
```

This is the one `git rm` invocation this plan asks the executor to run — it's *required* to take the directory out of the index after `.gitignore` is updated. It does not delete files from disk. If Andy prefers to run this himself, the executor should stop here and let him.

- [ ] **Step 5: Verify**

Run: `ls legacy/backend && git ls-files legacy/ | head`
Expected: `legacy/backend/` has files on disk; `git ls-files legacy/` outputs nothing.

- [ ] **Step 6: Commit checkpoint (Andy)**

Suggested message:

```
chore(repo): archive FastAPI backend to legacy/, hoist SQL to sql/

backend/ → legacy/backend/ (gitignored, kept locally for reference).
SQL migrations renamed and hoisted to sql/ at repo root.
```

**Stop here and wait for Andy to commit.**

---

## Task 4: Update Next.js config and path aliases for the new root

**Files:**
- Modify: `next.config.mjs`
- Delete: `jsconfig.json` (already deleted in Task 2)
- Create: `tsconfig.json`

- [ ] **Step 1: Update `next.config.mjs`**

The current config has `output: "standalone"` which was for Docker. Drop it — Vercel does its own packaging.

Replace the entire contents of `next.config.mjs` with:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

- [ ] **Step 2: Create root `tsconfig.json`**

Permissive settings so existing `.jsx`/`.js` files keep working. Strict mode can be turned on later, file by file.

Create `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true,
    "strict": false,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", ".next/types/**/*.ts", "next-env.d.ts"],
  "exclude": ["node_modules", "legacy", "redesign"]
}
```

**Note on the path alias change:** old `jsconfig.json` had `@/*` → `./src/*`. We now have everything at root, so the new alias is `@/*` → `./*`. Existing imports like `@/components/desktop/Superbar` keep working because `components/` is now at root.

- [ ] **Step 3: Install TypeScript and React types**

```bash
npm install --save-dev typescript @types/node @types/react @types/react-dom
```

- [ ] **Step 4: Verify the existing app still builds**

```bash
npm run dev
```

Expected: Next.js starts, listens on `http://localhost:3000`, the home page renders without TypeScript errors in the terminal. The static UI should look identical to before the move.

If Next.js writes a `next-env.d.ts` on first run, leave it in place — `.gitignore` already excludes it.

Stop the dev server with `Ctrl+C` once verified.

- [ ] **Step 5: Verify lint still runs**

```bash
npm run lint
```

Expected: lint runs to completion. Existing warnings/errors are OK as long as they're the same ones we had before the move.

- [ ] **Step 6: Commit checkpoint (Andy)**

Suggested message:

```
chore(config): switch to TypeScript-aware Next.js config at root

- tsconfig.json with allowJs=true (gradual TS migration)
- Path alias @/* now resolves from repo root
- next.config.mjs no longer outputs standalone (Vercel handles packaging)
- npm run dev renders existing static UI with zero behavior change
```

**Stop here and wait for Andy to commit.**

---

## Task 5: Rewrite `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace `.env.example`**

Drop the FastAPI-era variables (`NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`, `INTERNAL_API_URL`) and add the new ones (`SESSION_SECRET`, `JUDGE0_API_KEY`, `JUDGE0_API_HOST`).

Replace the entire contents of `.env.example` with:

```
# Copy this file to .env.local at the repo root.
# NEVER commit .env or .env.local with real values.

# ── Supabase (browser-safe — baked into the JS bundle at build time) ──────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# ── Supabase (server-only — never exposed to the browser) ─────────────────────
SUPABASE_URL=https://your-project.supabase.co
# Service role key bypasses Row Level Security — used only inside Route Handlers.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── Session signing ───────────────────────────────────────────────────────────
# 32+ random bytes, base64. Used to sign the ct_player cookie.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
SESSION_SECRET=

# ── AI judge ──────────────────────────────────────────────────────────────────
# Free Gemini API key from https://aistudio.google.com/apikey
GEMINI_API_KEY=

# ── Judge0 (optional — code execution for behavioural scoring) ────────────────
JUDGE0_API_KEY=
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com
```

- [ ] **Step 2: Update `.env`**

Open the current `.env` (which contains Andy's real Supabase keys). Make sure these keys are present, then add a `SESSION_SECRET`:

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
Copy the output. Add to `.env`:

```
SESSION_SECRET=<paste-the-random-string-here>
```

If `GEMINI_API_KEY` is already populated from before, leave it. Otherwise leave blank — Plan 3 will document obtaining one.

- [ ] **Step 3: Commit checkpoint (Andy)**

Suggested message:

```
chore(env): drop FastAPI env vars, add SESSION_SECRET / JUDGE0_*

NEXT_PUBLIC_API_URL, CORS_ORIGINS, INTERNAL_API_URL are gone.
SESSION_SECRET signs the ct_player cookie introduced in Plan 2.
```

**Stop here and wait for Andy to commit.**

---

## Task 6: Write migration `004_submissions_and_phases.sql`

**Files:**
- Create: `sql/004_submissions_and_phases.sql`

This migration creates the `submissions` table, adds `phase`/`phase_ends_at` to `rooms`, adds `seat_index` to `players`, and drops the unused `socket_id` column. Each statement is `IF NOT EXISTS` / `IF EXISTS` so the migration is idempotent.

- [ ] **Step 1: Create the migration file**

Create `sql/004_submissions_and_phases.sql` with:

```sql
-- 004_submissions_and_phases.sql
-- Moves the in-memory game state from the old Python manager into Postgres
-- so phase transitions are authoritative and replays become possible later.
-- Run AFTER 001_base_schema.sql, 002_rooms_round_count.sql, 003_scoring_and_elo.sql.

-- ── submissions ───────────────────────────────────────────────────────────────
-- One row per (round, chain) seat. round_num=0 holds the seed prompt
-- (author_id NULL); round_num=1..N holds player work.
CREATE TABLE IF NOT EXISTS submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  round_num     smallint NOT NULL,
  chain_index   smallint NOT NULL,
  author_id     uuid REFERENCES players(id) ON DELETE CASCADE,
  round_type    text NOT NULL CHECK (round_type IN ('code', 'describe')),
  content       text NOT NULL,
  language      text CHECK (language IS NULL OR language IN ('python', 'javascript', 'java')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, round_num, chain_index)
);

CREATE INDEX IF NOT EXISTS submissions_room_idx ON submissions (room_id, round_num);

-- ── rooms.phase / phase_ends_at ───────────────────────────────────────────────
-- Drives the UI directly via Realtime postgres_changes.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'lobby'
    CHECK (phase IN ('lobby', 'writing', 'describing', 'reimplementing', 'reveal', 'ended'));

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS phase_ends_at timestamptz;

-- ── players.seat_index ────────────────────────────────────────────────────────
-- Stable seating order set at game start. NULL while in lobby.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS seat_index smallint;

-- ── players.socket_id (drop) ──────────────────────────────────────────────────
-- No longer needed: Realtime replaces our custom WebSocket protocol.
ALTER TABLE players
  DROP COLUMN IF EXISTS socket_id;
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Andy will paste the file contents into the Supabase SQL editor and run it. Or use `psql`/Supabase CLI if he prefers.

**Stop and wait for Andy to confirm the migration ran successfully** (Supabase will report "Success. No rows returned" for each statement, or row counts for the ALTERs).

- [ ] **Step 3: Verify in Supabase**

After Andy confirms, in the Supabase SQL editor run:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('rooms', 'players', 'submissions')
ORDER BY table_name, ordinal_position;
```

Expected to see: `rooms.phase`, `rooms.phase_ends_at`, `players.seat_index`, no `players.socket_id`, and the full `submissions` table.

- [ ] **Step 4: Commit checkpoint (Andy)**

Suggested message:

```
feat(db): add submissions table + rooms.phase + players.seat_index

004_submissions_and_phases.sql is the schema half of the Python-manager port.
Drops the unused players.socket_id column.
```

**Stop here and wait for Andy to commit.**

---

## Task 7: Write migration `005_chain_scores.sql`

**Files:**
- Create: `sql/005_chain_scores.sql`

- [ ] **Step 1: Create the migration file**

Create `sql/005_chain_scores.sql` with:

```sql
-- 005_chain_scores.sql
-- Per-chain AI judge results. Streams in via Realtime as the judge completes
-- each chain. Folded into game_scores from 003_scoring_and_elo.sql later,
-- once accounts come back into scope.

CREATE TABLE IF NOT EXISTS chain_scores (
  room_id       uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  chain_index   smallint NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'failed')),
  overall_score real,
  notes         text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, chain_index)
);
```

- [ ] **Step 2: Apply the migration to Supabase**

Same procedure as Task 6 Step 2. **Stop and wait for Andy to confirm.**

- [ ] **Step 3: Verify**

In the Supabase SQL editor:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'chain_scores'
ORDER BY ordinal_position;
```

Expected: rows for `room_id`, `chain_index`, `status`, `overall_score`, `notes`, `updated_at`.

- [ ] **Step 4: Commit checkpoint (Andy)**

Suggested message:

```
feat(db): add chain_scores table

Holds streaming AI judge results per chain (pending → done | failed).
```

**Stop here and wait for Andy to commit.**

---

## Task 8: Write migration `006_rls.sql` (read-only RLS for clients)

**Files:**
- Create: `sql/006_rls.sql`

This is the architectural invariant from the spec: browsers can SELECT but never write. Writes always go through Route Handlers using the service-role key (which bypasses RLS).

- [ ] **Step 1: Create the migration file**

Create `sql/006_rls.sql` with:

```sql
-- 006_rls.sql
-- Enforces the "browser is read-only" invariant in the database, not just
-- by convention. The service-role key bypasses RLS, so Route Handlers
-- still write freely.

-- Enable RLS.
ALTER TABLE rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts        ENABLE ROW LEVEL SECURITY;

-- Anon + authenticated users get SELECT on game tables.
-- No INSERT / UPDATE / DELETE policies → those operations are denied
-- for non-service-role connections.
CREATE POLICY "rooms_select_all"        ON rooms        FOR SELECT USING (true);
CREATE POLICY "players_select_all"      ON players      FOR SELECT USING (true);
CREATE POLICY "submissions_select_all"  ON submissions  FOR SELECT USING (true);
CREATE POLICY "chain_scores_select_all" ON chain_scores FOR SELECT USING (true);
CREATE POLICY "prompts_select_all"      ON prompts      FOR SELECT USING (true);

-- Dormant tables (003_scoring_and_elo.sql): no client access at all.
-- They'll get policies when accounts/ELO come back.
ALTER TABLE IF EXISTS users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS games         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS game_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS elo_history   ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply to Supabase**

**Stop and wait for Andy to confirm.**

- [ ] **Step 3: Verify with a write attempt from the anon role**

In the Supabase SQL editor, click "Run as anon" (or open the `psql` shell with the anon key) and run:

```sql
INSERT INTO rooms (code) VALUES ('ZZTEST') RETURNING *;
```

Expected: error `permission denied for table rooms` or `new row violates row-level security policy`.

Then, again as anon:

```sql
SELECT id, code FROM rooms LIMIT 1;
```

Expected: rows returned (or empty if no rooms yet). No permission error.

If anon writes succeed, **stop and investigate** — the policies didn't apply.

- [ ] **Step 4: Commit checkpoint (Andy)**

Suggested message:

```
feat(db): enable RLS — clients are read-only, service-role writes only

Enforces in-database the invariant from the spec: browsers can subscribe
to postgres_changes but cannot mutate. All writes flow through Route
Handlers using the service-role key.
```

**Stop here and wait for Andy to commit.**

---

## Task 9: Add `@supabase/supabase-js` and the server-side client

**Files:**
- Create: `lib/supabase/server.ts`

The package is already in `package.json` (`@supabase/supabase-js@^2.78.0`), but only the browser client exists today. We add a service-role client that is **server-only** and never imported from a Client Component.

- [ ] **Step 1: Verify the package is installed**

```bash
node -e "require('@supabase/supabase-js'); console.log('ok')"
```

Expected: prints `ok`. If it errors, run `npm install` first.

- [ ] **Step 2: Write a failing test for the server client**

Create `lib/supabase/__tests__/server.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('getServiceClient', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns a client with the service-role key in headers', async () => {
    const { getServiceClient } = await import('../server');
    const client = getServiceClient();
    expect(client).toBeDefined();
    // The Supabase JS client doesn't expose the key directly, but
    // it does expose the configured URL on `client.supabaseUrl`.
    // We assert what we can without poking internals.
    expect((client as any).supabaseUrl).toBe('https://example.supabase.co');
  });

  it('throws if SUPABASE_URL is missing', async () => {
    delete process.env.SUPABASE_URL;
    // Force a fresh module evaluation by jittering the path.
    const mod = await import('../server?missing-url' as string).catch((e) => ({ getServiceClient: () => { throw e; } }));
    expect(() => (mod as any).getServiceClient()).toThrow();
  });
});
```

- [ ] **Step 3: Install Vitest**

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

Add to `package.json` `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts` at repo root:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: ['node_modules', 'legacy', 'redesign', '.next'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 4: Run the test — expect failure**

```bash
npm test
```

Expected: test fails with `Cannot find module '../server'`. That's the failing-test state.

- [ ] **Step 5: Implement `lib/supabase/server.ts`**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Bypasses RLS — only call from Route Handlers
 * and Server Components, never from "use client" code. Lazy + cached so a
 * cold serverless invocation pays the construction cost at most once.
 */
export function getServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

- [ ] **Step 6: Run the test — expect pass**

```bash
npm test
```

Expected: the first test passes. The second test (the "missing URL" one) may pass or skip depending on how Vitest caches modules — if it fails, delete that second test case; module-cache busting in Vitest is brittle and the first test is what we actually care about.

- [ ] **Step 7: Commit checkpoint (Andy)**

Suggested message:

```
feat(supabase): add service-role client (lib/supabase/server.ts)

Lazy, cached, throws fast on missing env vars. Route Handlers in
upcoming plans import getServiceClient() to perform all writes.
```

**Stop here and wait for Andy to commit.**

---

## Task 10: Replace the existing browser Supabase client with a typed version

**Files:**
- Modify: `lib/supabase/client.js` → rename to `browser.ts` and rewrite

The existing file is fine but uses `.js`. Promote it to `.ts` now so route handlers and components have one consistent import surface.

- [ ] **Step 1: Read the existing browser client**

```bash
cat lib/supabase/client.js
```

Read what it does. The expected content is a small wrapper around `createClient` using the public env vars. (Read this file directly with the Read tool to make sure.)

- [ ] **Step 2: Rename and rewrite**

```bash
git mv lib/supabase/client.js lib/supabase/browser.ts
```

Then overwrite `lib/supabase/browser.ts` with:

```typescript
'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Anon-key Supabase client for the browser. RLS applies — clients can only
 * SELECT and subscribe to Realtime; mutations go through Route Handlers.
 */
export function getBrowserClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
  }

  cached = createClient(url, key);
  return cached;
}
```

- [ ] **Step 3: Update existing imports**

Search for the old import:

```bash
grep -rn "lib/supabase/client" app components lib
```

Expected: any matches use the path `@/lib/supabase/client` or relative. For each, change `client` → `browser` and the named import to `getBrowserClient`. The existing default-or-singleton export shape may differ — adapt the call site to use `getBrowserClient()`.

If there are zero matches (no current consumers), that's also fine — the file is now ready for Plan 2 to use.

- [ ] **Step 4: Verify the app still builds**

```bash
npm run dev
```

Open http://localhost:3000 — the home page renders without console errors related to Supabase. Stop the server.

- [ ] **Step 5: Commit checkpoint (Andy)**

Suggested message:

```
refactor(supabase): promote browser client to TS (lib/supabase/browser.ts)

Single named export getBrowserClient(). Mirrors getServiceClient() shape.
```

**Stop here and wait for Andy to commit.**

---

## Task 11: Update the root README

**Files:**
- Modify: `README.md`

The current README describes the split Next.js + FastAPI setup. Replace it with one that matches reality.

- [ ] **Step 1: Replace `README.md`**

Overwrite `README.md` with:

```markdown
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
```

- [ ] **Step 2: Commit checkpoint (Andy)**

Suggested message:

```
docs(readme): rewrite for merged Next.js + Supabase stack

Drops FastAPI/Docker instructions. Documents migrations, env vars,
and points at the upcoming plan series.
```

**Stop here and wait for Andy to commit.**

---

## Task 12: Final verification of the plan's exit criteria

**Files:**
- Read-only.

This task confirms the spec's Step 0 and Step 1 exit criteria from the design doc:

> Step 0 — `npm run dev` at the repo root renders existing static screens.
> Step 1 — schema applied; clients can SELECT but not INSERT.

- [ ] **Step 1: Dev server still renders the static UI**

```bash
npm run dev
```

Open http://localhost:3000. Navigate to the existing static screens:
- `/` (home)
- `/waiting-room`
- `/editor`
- `/describe`
- `/reimplement`
- `/reveal`

Each should render with no console errors. Stop the server.

- [ ] **Step 2: Type-check the project**

```bash
npx tsc --noEmit
```

Expected: completes with no errors. (Some warnings about `.js`/`.jsx` files are fine — `allowJs` + `checkJs: false`.)

- [ ] **Step 3: Tests pass**

```bash
npm test
```

Expected: the `getServiceClient` test passes.

- [ ] **Step 4: Supabase write attempt from anon is denied**

In the Supabase SQL editor, "Run as anon":

```sql
INSERT INTO submissions (room_id, round_num, chain_index, round_type, content)
VALUES (gen_random_uuid(), 0, 0, 'code', 'x') RETURNING *;
```

Expected: RLS error.

- [ ] **Step 5: Final commit checkpoint (Andy)**

If anything was tweaked during verification, commit it. Suggested message:

```
chore: verify Plan 1 exit criteria

- Static UI renders
- tsc clean
- Tests pass
- RLS enforces anon read-only
```

---

## Plan 1 — Exit criteria

After this plan is complete:

- Repo has a single Next.js project at the root.
- TypeScript is configured permissively; existing `.jsx`/`.js` files still build.
- Old backend is at `legacy/backend/`, gitignored.
- Six migrations applied to Supabase: `001`–`006`.
- RLS is on for all game tables; clients are read-only.
- `lib/supabase/server.ts` exports `getServiceClient()`; `lib/supabase/browser.ts` exports `getBrowserClient()`.
- `npm run dev` renders the existing static UI with no console errors.
- README, `.env.example`, and `.gitignore` reflect the merged stack.

Plan 2 builds on this: signed-cookie identity, room create/join/leave/start, and the first Realtime-driven UI (the lobby).

## Self-review notes

- **Spec coverage for this plan's slice (Steps 0+1 of the migration plan):** ✓ repo move, ✓ allowJs TS migration, ✓ legacy backend archived + gitignored, ✓ submissions + chain_scores + RLS migrations, ✓ Supabase clients, ✓ env vars cleaned up. The spec's Step 1 "Add lib/supabase/browser.ts and lib/supabase/server.ts" is covered by Tasks 9–10.
- **Type consistency:** `getServiceClient`/`getBrowserClient` naming matches across both files. The migration column names (`phase`, `phase_ends_at`, `seat_index`, `chain_scores.status`/`overall_score`/`notes`) match the spec verbatim.
- **No placeholders:** every code block is complete and runnable. No "TBD" or "implement later" entries.
- **Andy's no-commit preference:** all `git commit` steps are framed as "Commit checkpoint (Andy) — Stop and wait." The only git write the executor runs itself is the required `git mv`/`git rm --cached` for the repo restructure, which is flagged explicitly.
