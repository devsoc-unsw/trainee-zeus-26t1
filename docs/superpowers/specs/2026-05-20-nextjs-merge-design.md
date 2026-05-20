# Merging the FastAPI Backend into Next.js — Design

**Status:** Approved (brainstorm), pending implementation plan
**Date:** 2026-05-20
**Topic:** Collapse the split Next.js + FastAPI stack into a single Next.js app deployed to Vercel.

## Goal

Make the demo trivial to deploy and trivial to show. Replace the two-process setup (Next.js + FastAPI on separate hosts) with a single `vercel deploy` of a Next.js app that owns UI, API routes, and game logic. Keep Supabase as the only stateful dependency.

## Non-goals

- ELO, accounts, replays, persistent player history. Deferred until after the demo.
- Backward compatibility with the existing FastAPI WebSocket protocol — that wire format is dropped.
- Cross-language judging (Python original vs. JS reconstruction). Single language per chain only.
- Production-grade hardening (CSRF tokens, rate limiting, abuse mitigation). Demo posture only.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Deploy target | One Vercel deploy | Simplest demo story; constrains us to serverless. |
| Realtime | Supabase Realtime (`postgres_changes`) | Already using Supabase; no new vendors; works on Vercel. |
| Demo feature set | Room + lobby + chain + AI judge + Judge0 | ELO/replays/accounts deferred. |
| Port strategy | Full rewrite Python → TypeScript | Single-language codebase; cleanest fit for serverless. |
| Language | TypeScript across the codebase | Game schemas, AI payloads, and scoring logic benefit from types. |
| AI judge provider | Google Gemini | Already installed (`google-genai`); generous free tier for demo. |
| Auth model | Nickname + room code, no accounts | Demo simplicity. Implies ELO/replays deferred. |
| Existing `backend/` | Move to `legacy/backend/`, add to `.gitignore` | Cautious; recoverable until JS port is verified. |
| Architecture | Postgres-as-truth + Route Handlers; Realtime fan-out | Simple mental model; replays come for free when accounts return. |

## Top-level architecture

```
                ┌────────────────────────────────────────────┐
                │              Vercel (Next.js)              │
                │                                            │
   Browser ───► │  React App Router pages (UI)               │
       ▲        │  Route Handlers (app/api/**)               │
       │        │    └─ game logic (lib/game/*)              │
       │        │    └─ ai judge (lib/judge/gemini.ts)       │
       │        │    └─ code exec  (lib/judge0/*)            │
       │        └─────────────────┬──────────────────────────┘
       │                          │ service-role
       │                          ▼
       │                  ┌─────────────────┐
       └── Realtime ◄──── │ Supabase Cloud  │ ◄── nothing else writes
            (postgres     │  Postgres + RT  │
             _changes)    └─────────────────┘
```

**Invariants:**

- One process type, one deploy target. Pages, route handlers, and game logic ship as a single Next.js app.
- Postgres is the only source of truth. Route handlers are the only writers.
- Browsers never write to Postgres directly. RLS policies allow SELECT only.
- Supabase Realtime is the only realtime mechanism. Clients subscribe to `postgres_changes` filtered by `room_id`.
- External calls (Gemini, Judge0) happen only inside route handlers, never from the browser.

## Data model

### Tables retained from existing schema

- `rooms` — `id`, `code` (6-char), `host_id`, `status` (`lobby` | `active` | `ended`), `game_mode`, `current_round`, `round_count`
- `players` — `id`, `name`, `room_id`, `role`, `is_host`
- `prompts` — `id`, `text`, `category`

### Net-new table: `submissions`

The Python manager held this in memory; we move it to Postgres so phase transitions can be authoritative and replays "come for free" later.

```sql
CREATE TABLE submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  round_num     smallint NOT NULL,                -- 0=seed prompt, 1..round_count=play
  chain_index   smallint NOT NULL,                -- which chain this segment belongs to
  author_id     uuid REFERENCES players(id) ON DELETE CASCADE,  -- NULL only for round 0 seeds
  round_type    text NOT NULL,                    -- 'code' | 'describe'
  content       text NOT NULL,
  language      text,                             -- 'python' | 'javascript' | 'java' | NULL for describe
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, round_num, chain_index)
);
CREATE INDEX submissions_room_idx ON submissions (room_id, round_num);
```

Round 0 holds the seed prompts (one per chain) with `author_id = NULL`. The seeds aren't player work — they're prompts from the `prompts` table written into the submissions stream so the editor can render them through the same Realtime subscription as everything else.

### Additions to `rooms`

```sql
ALTER TABLE rooms ADD COLUMN phase text NOT NULL DEFAULT 'lobby';
-- phase in: 'lobby' | 'writing' | 'describing' | 'reimplementing' | 'reveal' | 'ended'
ALTER TABLE rooms ADD COLUMN phase_ends_at timestamptz;
```

`phase` drives the UI directly via Realtime. `phase_ends_at` is optional and only set when we add per-phase timers (out of scope for demo unless trivial).

### Addition to `players`

```sql
ALTER TABLE players ADD COLUMN seat_index smallint;
```

Stable seating order for chain seat math. Set at game start; never reshuffled mid-game.

`players.socket_id` is no longer used and is dropped from the schema:

```sql
ALTER TABLE players DROP COLUMN IF EXISTS socket_id;
```

### Net-new table: `chain_scores`

```sql
CREATE TABLE chain_scores (
  room_id       uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  chain_index   smallint NOT NULL,
  status        text NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'failed'
  overall_score real,
  notes         text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, chain_index)
);
```

When accounts return, fold this into `game_scores` from `003_scoring_and_elo.sql`.

### Deferred tables (already in `003_scoring_and_elo.sql`, leave dormant)

`users`, `games`, `game_scores`, `elo_history` — wake up when accounts come back into scope.

### RLS posture

RLS on for `rooms`, `players`, `submissions`, `chain_scores`. Policies allow SELECT only (clients are read-only subscribers). All writes go through Route Handlers using the service-role key. This enforces the "browser never writes" invariant in the database, not just by convention.

### Realtime subscriptions

Clients open subscriptions on:

- `rooms` filtered by `id = :room_id` — phase transitions, lobby/game state
- `players` filtered by `room_id` — lobby player list
- `submissions` filtered by `room_id` — "X submitted" badges, reveal payload
- `chain_scores` filtered by `room_id` — scores streaming in on the reveal screen

## Round flow

End-to-end for a phase transition (host clicks "Start Game"):

1. Host browser POSTs `/api/rooms/:code/start`.
2. Route handler (service-role client):
   - Loads room + players, validates `is_host`, ≥ 2 players, `status = 'lobby'`.
   - Picks N prompts (N = player count = chain count).
   - In a single transaction:
     - `UPDATE rooms SET status='active', phase='writing', current_round=1`
     - Inserts one seed row per chain into `submissions` (`round_num=0`, `chain_index=i`, `round_type='code'`, `content=prompt_text`).
   - Returns 200.
3. Postgres triggers `postgres_changes`.
4. Every subscribed browser receives:
   - `rooms` UPDATE (`phase='writing'`)
   - `submissions` INSERTs (the seed prompts)
   Clients route to `/editor` and hydrate with their seat's seed.

**Server is the only authority for transitions.** Browser actions are intent (POST `/round/submit`), not state.

A submit handler:

1. Verifies the cookie's `playerId` is the correct author for `(room_id, current_round, chain_index)` using the seat math.
2. Inserts a `submissions` row.
3. In the same transaction, checks: are all chains' submissions present for `current_round`?
   - **No** → return 200. The INSERT already broadcast "X submitted" to others.
   - **Yes** → transition: bump `current_round`, flip `phase`. If last round → set `phase='reveal'` and kick off AI judging (see next section).

### Chain seat math

For chain `c`, round `r`, the author is `players_sorted_by_seat_index[(c + r) mod N]`. Identical to existing `manager.py` logic, but reading from `players.seat_index` instead of recomputing from join timestamps.

### Race conditions

Two clients submitting near-simultaneously for the last seat must not both believe they triggered the transition. The "are we done?" check runs inside the same transaction as the INSERT, using `SELECT ... FOR UPDATE` on the room row, or a single SQL CTE that inserts + counts + conditionally updates.

## AI judge + Judge0

Vercel functions have execution-time limits (10s on Hobby, 60s on Pro). Multi-chain judging exceeds this in a single request, so it must be async, with results streaming back via Realtime.

### Flow when phase flips to `reveal`

1. Submit handler (last submission):
   - `UPDATE rooms SET phase='reveal'`
   - Inserts a `chain_scores` row per chain with `status='pending'`.
   - Returns 200.
2. All clients route to `/reveal`. Chains render immediately (all submissions are present). `chain_scores` placeholders render as "judging…".
3. The submit handler also invokes `judgeRoom(roomId)` via `waitUntil` (or the client posts to `/api/judge/:roomId` once on entry — implementation chooses; both are acceptable).
4. The judge handler runs per chain, sequentially:
   - Pulls original code (round 1) + final code (last round).
   - Optional: asks Gemini to generate 2–3 test cases for the original function.
   - Optional: Judge0 runs both functions against those cases.
   - Builds a Gemini judging prompt with original, reconstruction, and behavioral test results (if available). Asks for `{ overallScore: 0–100, notes: string }`.
   - `UPDATE chain_scores SET status='done', overall_score=..., notes=...`.
5. Clients see each chain's score animate in as it completes via Realtime.

### Module boundaries

- `lib/judge/gemini.ts` — `judgeChain(original, final, testResults?) → { score, notes }`. Owns the Gemini call and prompt template.
- `lib/judge0/run.ts` — `runCases(code, language, cases) → TestResult[]`. Owns Judge0 RapidAPI auth and result polling. Returns gracefully on failure.
- `lib/game/judging.ts` — `judgeRoom(roomId)`. Loads chains, calls the two above, writes `chain_scores`.

### Failure handling

- Judge0 fails → judge with code-only context, set `notes` to flag it.
- Gemini fails → `chain_scores.status = 'failed'`. Reveal shows "scoring unavailable" for that chain. Other chains still complete.
- Run chains sequentially, not in parallel. Keeps us under serverless timeouts (60s budget for ~5 chains × ~8s each) and under rate limits.

### Deferred even though in scope

- Parallel multi-chain judging.
- Cross-language judging.

## Identity / session

Nickname + room code, no accounts. We still need stable per-browser identity so refresh doesn't kick a player out and so submit handlers can authorize.

### Mechanism

- On `POST /api/rooms` (create) or `POST /api/rooms/:code/join`, the handler:
  1. Inserts a `players` row.
  2. Sets a signed, HTTP-only cookie `ct_player = { playerId, roomId }`, signed with `SESSION_SECRET` (HMAC).
- Every mutating route handler reads the cookie, verifies the signature, and confirms the player still belongs to the room.
- Cookie format: `<base64url(json)>.<hmac>`. Tiny home-rolled signer; no auth library.
- `lib/auth/session.ts` exports `signSession`, `verifySession`, `setSessionCookie`, `readSessionCookie`. ~50 lines.

The browser never sends raw `playerId` in a POST body. Spoofing a seat would otherwise be a 2-line attack.

### Re-join on refresh

- Page load → server component reads cookie → if `roomId` matches URL, hydrate.
- If cookie's room no longer exists, clear cookie and bounce to home.
- No presence/reconnect dance. Players are present iff their row exists.

### Host privileges

- `players.is_host = true` for the creator.
- `/start` and `/reset` handlers verify `playerId === room.host_id`.
- Host leaving transfers `is_host` to the next-joined player **and** updates `rooms.host_id`, both in the same transaction inside the leave handler. Idempotent if the host leaves twice.

### Name collisions in a room

- Handler rejects with 409 if `name` already exists in the room (case-insensitive trim). Matches existing Python behavior.

### Not done for demo

- No CSRF tokens. Cookie is `SameSite=Lax`; mutating routes are POST-only. Acceptable for single-origin demo.
- No rate limiting.

## Repo layout

```
trainee-zeus-26t1/
├── app/                            ← Next.js App Router at repo root
│   ├── (game)/
│   │   ├── page.jsx                ← home: create / join
│   │   ├── waiting-room/[code]/page.jsx
│   │   ├── editor/[code]/page.jsx
│   │   ├── describe/[code]/page.jsx
│   │   ├── reimplement/[code]/page.jsx
│   │   └── reveal/[code]/page.jsx
│   ├── api/
│   │   ├── rooms/
│   │   │   ├── route.ts                       ← POST create
│   │   │   └── [code]/
│   │   │       ├── join/route.ts              ← POST
│   │   │       ├── leave/route.ts             ← POST
│   │   │       ├── start/route.ts             ← POST
│   │   │       ├── reset/route.ts             ← POST
│   │   │       └── submit/route.ts            ← POST  round_type-aware
│   │   ├── health/route.ts
│   │   └── judge/[roomId]/route.ts            ← POST  fire-and-forget judge
│   ├── layout.jsx
│   └── globals.css
├── components/                     ← windows, chrome, taskbar, etc.
├── lib/
│   ├── supabase/
│   │   ├── browser.ts              ← anon client (read-only subscriptions)
│   │   └── server.ts               ← service-role client (route-handler-only)
│   ├── auth/
│   │   └── session.ts              ← signed-cookie helpers
│   ├── game/
│   │   ├── rooms.ts                ← create / join / leave / start / reset
│   │   ├── round.ts                ← submit + phase transitions (ports manager.py)
│   │   ├── seating.ts              ← (round, chain_index) → player
│   │   ├── prompts.ts              ← pick prompts
│   │   └── judging.ts              ← judgeRoom orchestrator
│   ├── judge/
│   │   └── gemini.ts               ← judgeChain
│   ├── judge0/
│   │   └── run.ts                  ← runCases
│   └── realtime/
│       ├── useRoom.ts              ← hook: subscribe to rooms+players+submissions+scores
│       └── channels.ts             ← channel-name helpers
├── public/
├── sql/                            ← canonical migrations
│   ├── 001_base_schema.sql              ← was supabase_game_schema.sql
│   ├── 002_rooms_round_count.sql
│   ├── 003_scoring_and_elo.sql          ← dormant tables (users, games, …)
│   ├── 004_submissions_and_phases.sql   ← NEW: submissions, rooms.phase, players.seat_index, drop socket_id
│   └── 005_chain_scores.sql             ← NEW: chain_scores
├── tests/
│   ├── game/round.test.ts
│   ├── api/submit.test.ts
│   └── helpers/db.ts
├── package.json
├── tsconfig.json
├── next.config.mjs
├── eslint.config.mjs
├── README.md
├── docs/
└── legacy/                         ← gitignored, kept locally
    └── backend/
```

**Key moves from current layout:**

- Hoist `frontend/src/app` → repo root `app/`. One Next.js project at the root.
- `frontend/src/lib/socket/*` → `lib/realtime/*`, rewritten against Supabase Realtime.
- `backend/sql/*.sql` → `sql/*` at repo root.
- `backend/app/game/*.py` → `lib/game/*.ts`.
- Delete top-level Dockerfiles. Keep `docker-compose.yml` only if useful for local Supabase.
- Move `backend/` → `legacy/backend/` and add to `.gitignore`.

`redesign/` is out of scope; left untouched.

## Error handling

Three layers, each with a single rule:

1. **Route handlers return typed errors, never throw to the client.**
   Envelope: `{ error: { code, message } }` with appropriate HTTP status. Codes: `ROOM_NOT_FOUND`, `NAME_TAKEN`, `NOT_HOST`, `NOT_ENOUGH_PLAYERS`, `GAME_IN_PROGRESS`, `INVALID_SUBMIT`, `INTERNAL`. These match the existing `RoomErrorCode` literals in Python `schemas.py`, so the frontend's error UX maps 1:1.
2. **`lib/game/*` modules throw `GameError`.** Route handlers catch once at the top and translate to the envelope. Anything else is 500 with `code='INTERNAL'`, logged, never echoed.
3. **External-call failures never break the game loop.** Gemini/Judge0 failures write `status='failed'` to `chain_scores`. Reveal shows "scoring unavailable" for that chain.

## Testing

| Layer | Tooling | What's tested | Why |
|---|---|---|---|
| Pure game logic | Vitest | `lib/game/seating.ts`, `lib/game/round.ts` transition predicates | Cheap, no DB, mirrors Python `manager.py` test coverage |
| Route handlers | Vitest + Next.js `NextRequest` test harness, real Supabase test DB | Each `app/api/**/route.ts` end-to-end: cookie auth, body validation, DB writes, error envelopes | Where regressions actually hurt |
| Realtime | One Playwright smoke test of the full chain | Two browser contexts: create → join → start → submit each phase → reveal | Realtime subs are too stateful for unit tests |
| AI judge | Snapshot test against a recorded Gemini response | `judgeChain(original, final)` against a fixture | Don't burn API quota in CI |

**Not tested for the demo:**

- Load
- Network-partition / Realtime-disconnect recovery
- ELO math (deferred)

**Test DB strategy:** separate Supabase project for tests, or local `supabase start`. Choose at implementation time. Migrations in `sql/` apply identically to both.

## Migration plan

Sequenced so the demo stays runnable at each step.

### Step 0 — Repo move (no behavior change)

- Hoist `frontend/src` → repo root. Update `tsconfig.json`, `next.config.mjs`, ESLint config.
- Convert `.jsx`/`.js` → `.tsx`/`.ts` with permissive `tsconfig` (`strict: false`, `allowJs: true`) so existing static UI keeps rendering.
- Move `backend/` → `legacy/backend/`. Add to `.gitignore`. Delete top-level Dockerfile and `docker-compose.yml` (or keep `docker-compose.yml` only for local Supabase).
- **Exit criteria:** `npm run dev` at root renders existing static screens.

### Step 1 — Supabase setup + migrations

- Write `sql/004_submissions_and_phases.sql` (creates `submissions`, adds `rooms.phase`, `rooms.phase_ends_at`, `players.seat_index`, drops `players.socket_id`) and `sql/005_chain_scores.sql` (creates `chain_scores`).
- Apply to a fresh Supabase project. Document the apply command in README.
- Turn RLS on for `rooms`, `players`, `submissions`, `chain_scores` with SELECT-only policies.
- Add `lib/supabase/browser.ts` (anon) and `lib/supabase/server.ts` (service-role).
- **Exit criteria:** schema applied; clients can SELECT but not INSERT.

### Step 2 — Identity + room lifecycle

- `lib/auth/session.ts` (signed cookie).
- `app/api/rooms/route.ts` (create), `app/api/rooms/[code]/join/route.ts`, `.../leave/route.ts`.
- Replace `frontend/src/lib/socket` lobby code with `lib/realtime/useRoom.ts` subscribing to `rooms` + `players`.
- **Exit criteria:** two tabs, one creates, one joins by code, lobby updates live.

### Step 3 — Round mechanic

- Port `manager.py` → `lib/game/round.ts` + `lib/game/seating.ts` + `lib/game/prompts.ts`.
- `app/api/rooms/[code]/start/route.ts`, `.../submit/route.ts`, `.../reset/route.ts`.
- Wire `/editor`, `/describe`, `/reimplement` pages to Realtime subscriptions + POST `/submit`.
- Vitest tests for seating + submit predicate.
- **Exit criteria:** 3-player chain flows through to `/reveal` with no scores yet.

### Step 4 — Reveal + AI judge

- `lib/judge/gemini.ts`, `lib/game/judging.ts`.
- `app/api/judge/[roomId]/route.ts` — fire-and-forget, sequential per chain, writes `chain_scores`.
- Reveal page subscribes to `chain_scores`, animates scores in as they arrive.
- Snapshot test against a recorded Gemini response.
- **Exit criteria:** reveal shows AI scores per chain.

### Step 5 — Judge0

- `lib/judge0/run.ts`.
- Plumb test results into the Gemini prompt in `lib/game/judging.ts`.
- Verify graceful degradation when `JUDGE0_API_KEY` is unset.
- **Exit criteria:** Judge0 results feed the score when available; reveal unaffected when not.

### Step 6 — Polish & deploy

- `vercel link` + `vercel env add` for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SESSION_SECRET`, `GEMINI_API_KEY`, `JUDGE0_API_KEY`, `JUDGE0_API_HOST`.
- One Playwright smoke test through the full chain.
- `vercel deploy`.
- **Exit criteria:** demo URL plays through a full game end-to-end.

### Rollback story

Each step is a self-contained commit. If step 4's AI judging regresses, revert that commit and the rest of the game still runs (reveal just shows chains without scores).

## Out of scope (explicit, so the plan doesn't quietly grow)

- ELO, `users`, `games`, `game_scores`, `elo_history`.
- Replays.
- Auth provider integration (Supabase Auth).
- The `redesign/` folder.
- Per-phase timers (`phase_ends_at` is reserved in the schema but not wired in).
- Cross-language judging.
- Parallel multi-chain judging.
- CSRF tokens and rate limiting.

## Environment variables

Added or renamed for the merged stack:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server-only.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser (Realtime subscriptions).
- `SESSION_SECRET` — HMAC key for signed cookies.
- `GEMINI_API_KEY` — server-only.
- `JUDGE0_API_KEY`, `JUDGE0_API_HOST` — server-only.

Removed:

- `NEXT_PUBLIC_API_URL`, `INTERNAL_API_URL`, `CORS_ORIGINS` — no separate backend to point at.
