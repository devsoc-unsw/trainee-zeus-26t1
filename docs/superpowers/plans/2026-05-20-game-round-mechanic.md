# Game Round Mechanic Implementation Plan (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Andy's preference:** Never run `git add`, `git commit`, or `git push` unless the user has given explicit session-level permission. When a task says "Commit checkpoint", stop and report back with the suggested message.

**Goal:** A host can start a game; players cycle through the chain (writing → describing → reimplementing → describing → reimplementing …) for the configured round count; when the last round is submitted, every client lands on `/reveal/[code]` showing the full chain. **No AI scoring yet** — that's Plan 4. Exit: a 3-tab manual run starts at the lobby and ends at a populated reveal page in under a minute, with phase transitions arriving live via Realtime.

**Architecture:** Postgres is the single source of truth. Three PL/pgSQL RPCs (`start_game`, `submit_turn`, `reset_game`) own every state transition transactionally — no torn states under concurrent submits. Route handlers are thin: validate the signed cookie, call the RPC, translate errors. Browsers subscribe to `rooms`, `players`, **and now `submissions`** via Supabase Realtime and re-render reactively. Phase changes drive navigation: a single `useEffect` on `room.phase` calls `router.replace(...)` for each client.

**Tech Stack:** Same as Plan 2 — Next.js 16 App Router (Route Handlers), TypeScript (permissive `allowJs`), `@supabase/supabase-js`, Node `crypto` (cookie HMAC), Vitest. No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md` (Step 3: Round mechanic). Plan 4 adds the AI judge against `chain_scores`; Plan 5 adds Judge0 + Vercel deploy.

---

## File structure produced by this plan

```
trainee-zeus-26t1/
├── app/
│   ├── api/
│   │   └── rooms/[code]/
│   │       ├── me/route.ts                       ← NEW (GET — current player from cookie)
│   │       ├── start/route.ts                    ← NEW
│   │       ├── submit/route.ts                   ← NEW
│   │       └── reset/route.ts                    ← NEW
│   ├── describe/[code]/
│   │   ├── page.jsx                              ← MOVED from app/describe/page.jsx + REWRITTEN
│   │   └── page.module.css                       ← MOVED
│   ├── editor/[code]/
│   │   ├── page.jsx                              ← MOVED + REWRITTEN
│   │   └── page.module.css                       ← MOVED
│   ├── reimplement/[code]/
│   │   ├── page.jsx                              ← MOVED + REWRITTEN
│   │   └── page.module.css                       ← MOVED
│   ├── reveal/[code]/
│   │   ├── page.jsx                              ← MOVED + REWRITTEN (chains only, scores in Plan 4)
│   │   └── page.module.css                       ← MOVED
│   └── waiting-room/[code]/page.jsx              ← MODIFIED (start button + phase navigation)
├── lib/
│   ├── game/
│   │   ├── seating.ts                            ← NEW (pure seat math)
│   │   ├── prompts.ts                            ← NEW (pick N from `prompts` table)
│   │   └── round.ts                              ← NEW (TS wrappers around RPCs)
│   └── realtime/
│       └── useRoom.ts                            ← MODIFIED (now also subscribes to `submissions`)
└── sql/
    └── 009_round_rpcs_and_realtime.sql           ← NEW (3 RPCs + Realtime publication for submissions)
```

**Out of scope for this plan** (each landing in a later plan):
- AI scoring of chains (Plan 4) — `lib/judge/gemini.ts`, `lib/game/judging.ts`, `app/api/judge/[roomId]/route.ts`, `chain_scores` UI.
- Judge0 behavioral testing (Plan 5).
- Vercel deploy + Playwright smoke (Plan 5).
- Language picker beyond Python (hard-coded `'python'` for `'code'` submissions; the lobby UI's radio is cosmetic for now).
- Per-phase timers (`rooms.phase_ends_at` stays unused).
- Draft-text autosave (the old `clearDraft`/`saveDraft`/`loadDraft` from `lib/socket/session.js` is gone; rebuilding it would be a separate side-quest).

---

## Round flow recap (read this before writing code)

```
Lobby                                                       Reveal
  │                                                           ▲
  ▼                                                           │
Host clicks Start                                       Last submit
  │                                                           │
  ▼                                                           │
phase=writing  ──> phase=describing ──> phase=reimplementing ─┘
   (round 1)         (round 2)              (round 3)
   code              describe               code
                       │                       │
                       └────  alternates ──────┘
                       until current_round > round_count
```

**Seat math (spec verbatim):** for chain `c`, round `r`, the author is `players_sorted_by_seat_index[(c + r) mod N]`. Equivalently, given a player with seat `s` in round `r`, they work on chain `c = ((s - r) mod N + N) mod N` (the double-mod handles negative numbers in TS).

**Phase per round:**
- round 1 → `writing`
- round r > 1 even → `describing`
- round r > 1 odd → `reimplementing`
- round > round_count → `reveal`

So with `round_count=3`: writing → describing → reimplementing → reveal.
With `round_count=5`: writing → describing → reimplementing → describing → reimplementing → reveal.

---

## Task 1: Migration `009_round_rpcs_and_realtime.sql` — RPCs + submissions Realtime publication

**Files:**
- Create: `sql/009_round_rpcs_and_realtime.sql`

Three PL/pgSQL functions cover every state-changing operation in this plan:
- `start_game(p_player_id, p_room_id)` — host-only, validates lobby state, picks N prompts, assigns seat_index, inserts round-0 seeds, advances room to `phase='writing' status='active' current_round=1`.
- `submit_turn(p_player_id, p_room_id, p_content, p_language)` — validates the player's seat owns this turn, inserts the submission row, transitions phase if all chains are in for the round.
- `reset_game(p_player_id, p_room_id)` — host-only, returns the room to lobby and wipes round state. Survives partially-started games.

Each runs `SECURITY INVOKER` (default) but we GRANT EXECUTE only to `service_role` — RPCs are called from Route Handlers, never from the browser anon client. Each takes a `RAISE EXCEPTION 'CODE: message'` shape on validation errors; the TS wrapper in Task 5 parses the prefix into a `GameError` code.

We also add `submissions` to `supabase_realtime` so browser clients can subscribe to per-room INSERT events.

- [ ] **Step 1: Create the migration file**

Create `sql/009_round_rpcs_and_realtime.sql` with:

```sql
-- 009_round_rpcs_and_realtime.sql
--
-- Three RPCs cover every state transition for the round mechanic:
--   * start_game(player_id, room_id)
--   * submit_turn(player_id, room_id, content, language)
--   * reset_game(player_id, room_id)
--
-- All three run as service_role and raise GameError-prefixed exceptions
-- on validation failures. The TS wrapper parses the prefix.
--
-- Also adds `submissions` to the supabase_realtime publication so the
-- browser-side useRoom hook can subscribe to round events.

------------------------------------------------------------------------
-- start_game
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_game(p_player_id uuid, p_room_id uuid)
RETURNS TABLE(round_count smallint)
LANGUAGE plpgsql AS $$
DECLARE
  v_host_id      uuid;
  v_status       text;
  v_round_count  smallint;
  v_player_count int;
  v_prompt_count int;
BEGIN
  SELECT host_id, status::text, round_count
    INTO v_host_id, v_status, v_round_count
    FROM rooms WHERE id = p_room_id FOR UPDATE;

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_host_id != p_player_id THEN
    RAISE EXCEPTION 'NOT_HOST: only the host can start';
  END IF;
  IF v_status != 'lobby' THEN
    RAISE EXCEPTION 'GAME_IN_PROGRESS: room is not in lobby';
  END IF;

  SELECT count(*)::int INTO v_player_count
    FROM players WHERE room_id = p_room_id;
  IF v_player_count < 2 THEN
    RAISE EXCEPTION 'NOT_ENOUGH_PLAYERS: need at least 2 players (got %)', v_player_count;
  END IF;

  -- Need at least one prompt per chain.
  SELECT count(*)::int INTO v_prompt_count FROM prompts;
  IF v_prompt_count < v_player_count THEN
    RAISE EXCEPTION 'INTERNAL: only % prompts available for % players', v_prompt_count, v_player_count;
  END IF;

  -- Assign seat_index by join order.
  WITH ordered AS (
    SELECT id, (row_number() OVER (ORDER BY created_at) - 1)::smallint AS seat
      FROM players WHERE room_id = p_room_id
  )
  UPDATE players SET seat_index = ordered.seat
    FROM ordered WHERE players.id = ordered.id;

  -- Pick N random prompts and seed round 0. round_type='describe'
  -- (prompt text is English, not code), language=NULL.
  WITH picked AS (
    SELECT text, (row_number() OVER (ORDER BY random()) - 1)::smallint AS idx
      FROM prompts ORDER BY random() LIMIT v_player_count
  )
  INSERT INTO submissions (room_id, round_num, chain_index, author_id, round_type, content, language)
  SELECT p_room_id, 0::smallint, picked.idx, NULL, 'describe', picked.text, NULL
    FROM picked;

  UPDATE rooms SET status = 'active', phase = 'writing', current_round = 1
    WHERE id = p_room_id;

  RETURN QUERY SELECT v_round_count AS round_count;
END $$;

REVOKE EXECUTE ON FUNCTION start_game(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION start_game(uuid, uuid) TO service_role;

------------------------------------------------------------------------
-- submit_turn
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_turn(
  p_player_id uuid,
  p_room_id   uuid,
  p_content   text,
  p_language  text DEFAULT NULL
)
RETURNS TABLE(advanced bool, new_phase text, new_round smallint)
LANGUAGE plpgsql AS $$
DECLARE
  v_phase        text;
  v_current      smallint;
  v_round_count  smallint;
  v_seat         smallint;
  v_player_count int;
  v_chain_index  smallint;
  v_round_type   text;
  v_completed    int;
  v_next_round   smallint;
  v_next_phase   text;
BEGIN
  -- Lock the room row so two concurrent submits can't double-advance.
  SELECT phase, current_round, round_count
    INTO v_phase, v_current, v_round_count
    FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_phase NOT IN ('writing','describing','reimplementing') THEN
    RAISE EXCEPTION 'INVALID_SUBMIT: room is in phase %', v_phase;
  END IF;

  -- Player must be in the room and have a seat (set at start_game).
  SELECT seat_index INTO v_seat
    FROM players WHERE id = p_player_id AND room_id = p_room_id;
  IF v_seat IS NULL THEN
    RAISE EXCEPTION 'INVALID_SUBMIT: player not seated in this room';
  END IF;

  SELECT count(*)::int INTO v_player_count
    FROM players WHERE room_id = p_room_id;

  -- Chain math: c = ((seat - round) mod N + N) mod N
  v_chain_index := ((v_seat - v_current) % v_player_count + v_player_count) % v_player_count;

  -- Derive round_type from phase and validate language pairing.
  IF v_phase = 'describing' THEN
    v_round_type := 'describe';
    IF p_language IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_SUBMIT: describe phase must not include language';
    END IF;
  ELSE
    v_round_type := 'code';
    IF p_language IS NULL THEN
      RAISE EXCEPTION 'INVALID_SUBMIT: code phase requires a language';
    END IF;
  END IF;

  -- Insert; UNIQUE(room_id, round_num, chain_index) catches double-submits.
  BEGIN
    INSERT INTO submissions (room_id, round_num, chain_index, author_id, round_type, content, language)
      VALUES (p_room_id, v_current, v_chain_index, p_player_id, v_round_type, p_content, p_language);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'INVALID_SUBMIT: already submitted this round';
  END;

  -- Are all chains in for this round?
  SELECT count(*)::int INTO v_completed
    FROM submissions WHERE room_id = p_room_id AND round_num = v_current;

  IF v_completed < v_player_count THEN
    RETURN QUERY SELECT false, v_phase, v_current;
    RETURN;
  END IF;

  -- All in. Advance.
  v_next_round := (v_current + 1)::smallint;
  IF v_next_round > v_round_count THEN
    v_next_phase := 'reveal';
    -- Seed chain_scores placeholders so Plan 4's reveal UI has rows to bind to.
    INSERT INTO chain_scores (room_id, chain_index, status)
      SELECT p_room_id, g::smallint, 'pending'
      FROM generate_series(0, v_player_count - 1) AS g
      ON CONFLICT DO NOTHING;
    UPDATE rooms SET phase = v_next_phase WHERE id = p_room_id;
    RETURN QUERY SELECT true, v_next_phase, v_current;
  ELSE
    -- Phase pattern: 1=writing, even=describing, odd>1=reimplementing.
    v_next_phase := CASE
      WHEN v_next_round = 1 THEN 'writing'
      WHEN v_next_round % 2 = 0 THEN 'describing'
      ELSE 'reimplementing'
    END;
    UPDATE rooms SET phase = v_next_phase, current_round = v_next_round WHERE id = p_room_id;
    RETURN QUERY SELECT true, v_next_phase, v_next_round;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION submit_turn(uuid, uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION submit_turn(uuid, uuid, text, text) TO service_role;

------------------------------------------------------------------------
-- reset_game
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_game(p_player_id uuid, p_room_id uuid)
RETURNS TABLE(ok bool)
LANGUAGE plpgsql AS $$
DECLARE
  v_host_id uuid;
BEGIN
  SELECT host_id INTO v_host_id FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_host_id != p_player_id THEN
    RAISE EXCEPTION 'NOT_HOST: only the host can reset';
  END IF;

  DELETE FROM submissions  WHERE room_id = p_room_id;
  DELETE FROM chain_scores WHERE room_id = p_room_id;
  UPDATE players SET seat_index = NULL WHERE room_id = p_room_id;
  UPDATE rooms SET status = 'lobby', phase = 'lobby', current_round = 0 WHERE id = p_room_id;

  RETURN QUERY SELECT true;
END $$;

REVOKE EXECUTE ON FUNCTION reset_game(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION reset_game(uuid, uuid) TO service_role;

------------------------------------------------------------------------
-- Realtime: add submissions to the publication
------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE submissions;
  END IF;
END $$;
```

- [ ] **Step 2: Apply via Management API** (or paste into Supabase SQL editor)

If `SUPABASE_ACCESS_TOKEN` is in `.env`, the executor can apply via:

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2 | tr -d '\r')
REF=tqxdsjuxiljsmcqkjxxt
body=$(node -e "process.stdout.write(JSON.stringify({query: require('fs').readFileSync('sql/009_round_rpcs_and_realtime.sql','utf8')}))")
curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$body" -w "\nHTTP:%{http_code}\n"
```

Expected HTTP 201 with `[]` body.

If no PAT available, Andy pastes into Supabase SQL editor. **Stop and wait for Andy to confirm.**

- [ ] **Step 3: Verify**

```sql
SELECT proname FROM pg_proc WHERE proname IN ('start_game', 'submit_turn', 'reset_game') ORDER BY proname;
-- Expected: 3 rows.

SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename IN ('rooms','players','submissions','chain_scores')
ORDER BY tablename;
-- Expected: 3 rows after this migration (submissions joins rooms+players;
-- chain_scores still not in the pub — Plan 4 adds it).
```

- [ ] **Step 4: Commit checkpoint**

Suggested message:

```
feat(db): start_game / submit_turn / reset_game RPCs + submissions realtime

Round mechanic transitions go through three PL/pgSQL functions that
SELECT FOR UPDATE on the room row, so concurrent submits can't tear
state. Realtime publication adds `submissions` so browsers see
round-state changes the same way they see lobby changes.
```

---

## Task 2: `lib/game/seating.ts` — pure seat math (TDD)

**Files:**
- Test: `lib/game/__tests__/seating.test.ts`
- Create: `lib/game/seating.ts`

Two pure helpers. Use them server-side (route handlers don't need them, the RPCs handle math) and **client-side** so the editor/describe/reimplement pages can find the right seed row to display.

API:
- `chainForPlayer(seatIndex, round, playerCount) → number` — the chain this player is working on in this round.
- `phaseForRound(round) → 'writing'|'describing'|'reimplementing'|'reveal'` — pure mapping; takes `round_count` only to detect reveal.

- [ ] **Step 1: Write the failing test**

Create `lib/game/__tests__/seating.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { chainForPlayer, phaseForRound } from '../seating';

describe('chainForPlayer', () => {
  it('round 0 has chain == seat (the seed row)', () => {
    expect(chainForPlayer(0, 0, 3)).toBe(0);
    expect(chainForPlayer(1, 0, 3)).toBe(1);
    expect(chainForPlayer(2, 0, 3)).toBe(2);
  });
  it('round 1 shifts by -1 mod N', () => {
    // (seat - 1) mod 3
    expect(chainForPlayer(0, 1, 3)).toBe(2);
    expect(chainForPlayer(1, 1, 3)).toBe(0);
    expect(chainForPlayer(2, 1, 3)).toBe(1);
  });
  it('round equal to N wraps back to seat (full rotation)', () => {
    expect(chainForPlayer(0, 3, 3)).toBe(0);
    expect(chainForPlayer(2, 5, 5)).toBe(2);
  });
  it('handles seat 0 in round greater than N (double wrap)', () => {
    expect(chainForPlayer(0, 7, 3)).toBe(2); // (0 - 7) = -7 ; -7 mod 3 = -1 → +3 = 2
  });
});

describe('phaseForRound', () => {
  it('round 1 is writing', () => {
    expect(phaseForRound(1, 3)).toBe('writing');
    expect(phaseForRound(1, 5)).toBe('writing');
  });
  it('even rounds (≥2) are describing', () => {
    expect(phaseForRound(2, 3)).toBe('describing');
    expect(phaseForRound(4, 5)).toBe('describing');
  });
  it('odd rounds (≥3) are reimplementing', () => {
    expect(phaseForRound(3, 3)).toBe('reimplementing');
    expect(phaseForRound(5, 5)).toBe('reimplementing');
  });
  it('round greater than round_count is reveal', () => {
    expect(phaseForRound(4, 3)).toBe('reveal');
    expect(phaseForRound(6, 5)).toBe('reveal');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run lib/game/__tests__/seating.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `lib/game/seating.ts`**

```typescript
export type Phase = 'lobby' | 'writing' | 'describing' | 'reimplementing' | 'reveal' | 'ended';

/**
 * Which chain does this player work on for the given round?
 * Inverse of the spec's `(c + r) mod N → seat` rule.
 */
export function chainForPlayer(seatIndex: number, round: number, playerCount: number): number {
  const n = playerCount;
  return ((seatIndex - round) % n + n) % n;
}

/**
 * Phase pattern:
 *   round 1   → writing
 *   round even (≥2) → describing
 *   round odd  (≥3) → reimplementing
 *   round > round_count → reveal
 */
export function phaseForRound(round: number, roundCount: number): Phase {
  if (round > roundCount) return 'reveal';
  if (round === 1) return 'writing';
  if (round % 2 === 0) return 'describing';
  return 'reimplementing';
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/game/__tests__/seating.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit checkpoint**

```
feat(game): seating math — chainForPlayer + phaseForRound

Pure helpers consumed client-side (game screens) and as documentation
for what the submit_turn RPC computes server-side. Mirrors the spec's
(c + r) mod N seat assignment.
```

---

## Task 3: `lib/game/prompts.ts` — pick N prompts (TDD with mock Supabase)

**Files:**
- Test: `lib/game/__tests__/prompts.test.ts`
- Create: `lib/game/prompts.ts`

A tiny helper used by the `/api/rooms/[code]/start` route's pre-check (before calling `start_game`, surface a friendly `INTERNAL` if the prompts table is empty). The RPC also re-validates server-side; this is for nicer client errors.

API:
- `countPrompts(supabase) → number`
- `peekPrompts(supabase, limit) → Array<{ id, text, category }>` (for future debug; not load-bearing)

- [ ] **Step 1: Write the failing test**

Create `lib/game/__tests__/prompts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { countPrompts } from '../prompts';
import type { SupabaseClient } from '@supabase/supabase-js';

function mockSupabase(response: { count: number | null; error: { message: string } | null }) {
  const chain: Record<string, unknown> = {
    select() { return this; },
    head: false,
    count: 'exact' as const,
    then(resolve: (v: { count: number | null; error: unknown }) => void) {
      resolve(response);
    },
  };
  return {
    from() { return chain; },
  } as unknown as SupabaseClient;
}

describe('countPrompts', () => {
  it('returns the count when the query succeeds', async () => {
    const sb = mockSupabase({ count: 5, error: null });
    expect(await countPrompts(sb)).toBe(5);
  });
  it('returns 0 when count is null', async () => {
    const sb = mockSupabase({ count: null, error: null });
    expect(await countPrompts(sb)).toBe(0);
  });
  it('throws on error', async () => {
    const sb = mockSupabase({ count: null, error: { message: 'db down' } });
    await expect(countPrompts(sb)).rejects.toThrow(/db down/);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run lib/game/__tests__/prompts.test.ts
```

- [ ] **Step 3: Implement `lib/game/prompts.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns the row count of the `prompts` table. Used by the start
 * route to surface a friendly INTERNAL error when the seed list is
 * shorter than the lobby player count.
 */
export async function countPrompts(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('prompts')
    .select('*', { head: true, count: 'exact' });
  if (error) throw new Error(`prompts count failed: ${error.message}`);
  return count ?? 0;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/game/__tests__/prompts.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit checkpoint**

```
feat(game): countPrompts helper for start-route preflight

Lets the /api/rooms/[code]/start route surface "not enough prompts"
as a friendly INTERNAL envelope before the RPC raises it.
```

---

## Task 4: Extend `lib/realtime/useRoom.ts` to subscribe to `submissions`

**Files:**
- Modify: `lib/realtime/useRoom.ts`

The hook currently returns `{ room, players, loading, error }`. Add `submissions` (full array, filtered by `room_id`) with the same INSERT/UPDATE/DELETE subscription pattern as `players`.

We don't add `chain_scores` here — that's Plan 4's reveal screen concern.

- [ ] **Step 1: Update the type and initial state**

Open `lib/realtime/useRoom.ts`. Add a `SubmissionRow` type and a `submissions` field.

Add to the types section:

```typescript
export type SubmissionRow = {
  id: string;
  room_id: string;
  round_num: number;
  chain_index: number;
  author_id: string | null;
  round_type: 'code' | 'describe';
  content: string;
  language: 'python' | 'javascript' | 'java' | null;
  created_at: string;
};
```

Change `UseRoomState` to include `submissions: SubmissionRow[]`:

```typescript
export type UseRoomState = {
  room: RoomRow | null;
  players: PlayerRow[];
  submissions: SubmissionRow[];
  loading: boolean;
  error: string | null;
};
```

Update the initial `useState` call and the early-return-when-roomId-null branch to include `submissions: []`.

- [ ] **Step 2: Add the initial fetch**

In the `(async () => { ... })()` block, extend the `Promise.all` from two queries to three:

```typescript
const [roomRes, playersRes, submissionsRes] = await Promise.all([
  sb.from('rooms').select('*').eq('id', roomId).maybeSingle(),
  sb.from('players').select('*').eq('room_id', roomId).order('created_at', { ascending: true }),
  sb.from('submissions').select('*').eq('room_id', roomId).order('created_at', { ascending: true }),
]);
```

Update the error guard to include `submissionsRes.error`:

```typescript
if (roomRes.error || playersRes.error || submissionsRes.error) {
  setState((s) => ({
    ...s,
    loading: false,
    error:
      roomRes.error?.message ??
      playersRes.error?.message ??
      submissionsRes.error?.message ??
      'unknown',
  }));
  return;
}
```

And include submissions in the initial `setState`:

```typescript
setState({
  room: roomRes.data as RoomRow | null,
  players: (playersRes.data ?? []) as PlayerRow[],
  submissions: (submissionsRes.data ?? []) as SubmissionRow[],
  loading: false,
  error: null,
});
```

- [ ] **Step 3: Add the submissions Realtime channel**

Add a third `.channel()` block right after `playersCh`:

```typescript
const submissionsCh = sb
  .channel(submissionsChannel(roomId))
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'submissions', filter: `room_id=eq.${roomId}` },
    (payload) => {
      setState((s) => {
        const list = [...s.submissions];
        if (payload.eventType === 'INSERT') {
          list.push(payload.new as SubmissionRow);
        } else if (payload.eventType === 'UPDATE') {
          const idx = list.findIndex((r) => r.id === (payload.new as SubmissionRow).id);
          if (idx >= 0) list[idx] = payload.new as SubmissionRow;
        } else if (payload.eventType === 'DELETE') {
          const id = (payload.old as SubmissionRow).id;
          return { ...s, submissions: list.filter((r) => r.id !== id) };
        }
        list.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return { ...s, submissions: list };
      });
    },
  )
  .subscribe();
```

Update the cleanup to remove the new channel:

```typescript
return () => {
  cancelled = true;
  sb.removeChannel(roomCh);
  sb.removeChannel(playersCh);
  sb.removeChannel(submissionsCh);
};
```

- [ ] **Step 4: Add `submissionsChannel` helper**

In `lib/realtime/channels.ts`, add:

```typescript
export function submissionsChannel(roomId: string): string {
  return `submissions:${roomId}`;
}
```

And import it in `useRoom.ts`:

```typescript
import { roomChannel, playersChannel, submissionsChannel } from './channels';
```

- [ ] **Step 5: Extend the channels test**

Append to `lib/realtime/__tests__/channels.test.ts`:

```typescript
import { submissionsChannel } from '../channels';

describe('submissionsChannel', () => {
  it('encodes the room id', () => {
    expect(submissionsChannel('abc-123')).toBe('submissions:abc-123');
  });
});
```

Add `submissionsChannel` to the existing import line at the top.

- [ ] **Step 6: Run tests + tsc**

```bash
npx vitest run lib/realtime/__tests__/channels.test.ts
npx tsc --noEmit
```

Expected: channels tests pass (3 total now), tsc exit 0.

- [ ] **Step 7: Commit checkpoint**

```
feat(realtime): useRoom now subscribes to submissions too

Same pattern as players — initial fetch ordered by created_at, then a
postgres_changes channel filtered by room_id. Consumers get the full
ordered list and react to INSERT/UPDATE/DELETE individually.
```

---

## Task 5: `lib/game/round.ts` — TS wrappers around the three RPCs (TDD)

**Files:**
- Test: `lib/game/__tests__/round.test.ts`
- Create: `lib/game/round.ts`

Three thin wrappers that call the RPCs and translate `RAISE EXCEPTION 'CODE: message'` PostgreSQL errors back into our `GameError` shape. Same DI pattern as `lib/game/rooms.ts`.

API:
- `startGame({ supabase, playerId, roomId }) → { roundCount }`
- `submitTurn({ supabase, playerId, roomId, content, language }) → { advanced, newPhase, newRound }`
- `resetGame({ supabase, playerId, roomId }) → { ok: true }`

- [ ] **Step 1: Write the failing test**

Create `lib/game/__tests__/round.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { startGame, submitTurn, resetGame } from '../round';
import { GameError } from '../errors';

function mockSupabase(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    rpc: vi.fn((name: string) => Promise.resolve(responses[`rpc:${name}`] ?? { data: null, error: null })),
  } as never;
}

describe('startGame', () => {
  it('returns round_count on success', async () => {
    const sb = mockSupabase({ 'rpc:start_game': { data: [{ round_count: 3 }], error: null } });
    const result = await startGame({ supabase: sb, playerId: 'p1', roomId: 'r1' });
    expect(result).toEqual({ roundCount: 3 });
  });
  it('translates NOT_HOST exception into GameError', async () => {
    const sb = mockSupabase({
      'rpc:start_game': { data: null, error: { message: 'NOT_HOST: only the host can start' } },
    });
    await expect(startGame({ supabase: sb, playerId: 'p1', roomId: 'r1' }))
      .rejects.toMatchObject({ code: 'NOT_HOST' });
  });
  it('translates NOT_ENOUGH_PLAYERS', async () => {
    const sb = mockSupabase({
      'rpc:start_game': { data: null, error: { message: 'NOT_ENOUGH_PLAYERS: need 2' } },
    });
    await expect(startGame({ supabase: sb, playerId: 'p1', roomId: 'r1' }))
      .rejects.toMatchObject({ code: 'NOT_ENOUGH_PLAYERS' });
  });
  it('unknown prefix bubbles as INTERNAL', async () => {
    const sb = mockSupabase({
      'rpc:start_game': { data: null, error: { message: 'something else entirely' } },
    });
    await expect(startGame({ supabase: sb, playerId: 'p1', roomId: 'r1' }))
      .rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('submitTurn', () => {
  it('returns advanced=false when more submissions pending', async () => {
    const sb = mockSupabase({
      'rpc:submit_turn': { data: [{ advanced: false, new_phase: 'writing', new_round: 1 }], error: null },
    });
    const r = await submitTurn({ supabase: sb, playerId: 'p1', roomId: 'r1', content: 'code', language: 'python' });
    expect(r).toEqual({ advanced: false, newPhase: 'writing', newRound: 1 });
  });
  it('returns advanced=true on phase transition', async () => {
    const sb = mockSupabase({
      'rpc:submit_turn': { data: [{ advanced: true, new_phase: 'describing', new_round: 2 }], error: null },
    });
    const r = await submitTurn({ supabase: sb, playerId: 'p1', roomId: 'r1', content: 'code', language: 'python' });
    expect(r).toEqual({ advanced: true, newPhase: 'describing', newRound: 2 });
  });
  it('translates INVALID_SUBMIT', async () => {
    const sb = mockSupabase({
      'rpc:submit_turn': { data: null, error: { message: 'INVALID_SUBMIT: already submitted this round' } },
    });
    await expect(
      submitTurn({ supabase: sb, playerId: 'p1', roomId: 'r1', content: 'code', language: 'python' }),
    ).rejects.toMatchObject({ code: 'INVALID_SUBMIT' });
  });
});

describe('resetGame', () => {
  it('returns ok on success', async () => {
    const sb = mockSupabase({ 'rpc:reset_game': { data: [{ ok: true }], error: null } });
    const r = await resetGame({ supabase: sb, playerId: 'p1', roomId: 'r1' });
    expect(r).toEqual({ ok: true });
  });
  it('translates NOT_HOST', async () => {
    const sb = mockSupabase({
      'rpc:reset_game': { data: null, error: { message: 'NOT_HOST: only the host can reset' } },
    });
    await expect(resetGame({ supabase: sb, playerId: 'p1', roomId: 'r1' }))
      .rejects.toMatchObject({ code: 'NOT_HOST' });
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run lib/game/__tests__/round.test.ts
```

- [ ] **Step 3: Implement `lib/game/round.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { GameError, ERROR_CODES, type ErrorCode } from './errors';

const KNOWN_CODES: ReadonlyArray<ErrorCode> = [
  ERROR_CODES.ROOM_NOT_FOUND,
  ERROR_CODES.NAME_TAKEN,
  ERROR_CODES.NOT_HOST,
  ERROR_CODES.NOT_ENOUGH_PLAYERS,
  ERROR_CODES.GAME_IN_PROGRESS,
  ERROR_CODES.INVALID_SUBMIT,
  ERROR_CODES.INTERNAL,
];

/**
 * Postgres RAISE EXCEPTION messages look like `CODE: human message`.
 * Strip the prefix and turn it into a GameError; unknown prefixes
 * bubble as INTERNAL with the full text.
 */
function rpcError(err: { message?: string } | null | undefined): GameError {
  const msg = err?.message ?? 'unknown rpc error';
  for (const code of KNOWN_CODES) {
    const prefix = code + ':';
    if (msg.startsWith(prefix)) {
      return new GameError(code, msg.slice(prefix.length).trim());
    }
  }
  return new GameError('INTERNAL', msg);
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data) && data.length > 0) return data[0] as T;
  if (data && typeof data === 'object') return data as T;
  return null;
}

/* ── startGame ─────────────────────────────────────────────────────── */
export async function startGame(args: {
  supabase: SupabaseClient;
  playerId: string;
  roomId: string;
}): Promise<{ roundCount: number }> {
  const { data, error } = await args.supabase.rpc('start_game', {
    p_player_id: args.playerId,
    p_room_id: args.roomId,
  });
  if (error) throw rpcError(error);
  const row = firstRow<{ round_count: number }>(data);
  if (!row) throw new GameError('INTERNAL', 'start_game returned no row');
  return { roundCount: row.round_count };
}

/* ── submitTurn ────────────────────────────────────────────────────── */
export async function submitTurn(args: {
  supabase: SupabaseClient;
  playerId: string;
  roomId: string;
  content: string;
  language: 'python' | 'javascript' | 'java' | null;
}): Promise<{ advanced: boolean; newPhase: string; newRound: number }> {
  const { data, error } = await args.supabase.rpc('submit_turn', {
    p_player_id: args.playerId,
    p_room_id: args.roomId,
    p_content: args.content,
    p_language: args.language,
  });
  if (error) throw rpcError(error);
  const row = firstRow<{ advanced: boolean; new_phase: string; new_round: number }>(data);
  if (!row) throw new GameError('INTERNAL', 'submit_turn returned no row');
  return { advanced: row.advanced, newPhase: row.new_phase, newRound: row.new_round };
}

/* ── resetGame ─────────────────────────────────────────────────────── */
export async function resetGame(args: {
  supabase: SupabaseClient;
  playerId: string;
  roomId: string;
}): Promise<{ ok: true }> {
  const { error } = await args.supabase.rpc('reset_game', {
    p_player_id: args.playerId,
    p_room_id: args.roomId,
  });
  if (error) throw rpcError(error);
  return { ok: true };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/game/__tests__/round.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Full suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit checkpoint**

```
feat(game): round.ts — startGame / submitTurn / resetGame RPC wrappers

Parses 'CODE: message' RAISE EXCEPTION format into GameError. Unknown
prefixes bubble as INTERNAL. Same DI pattern as rooms.ts so route
handlers inject getServiceClient() and tests inject a mocked client.
```

---

## Task 6: GET `/api/rooms/[code]/me` route handler

**Files:**
- Test: `app/api/rooms/[code]/me/__tests__/route.test.ts`
- Create: `app/api/rooms/[code]/me/route.ts`

Returns the current player's row based on the signed cookie. The page-level UIs need `seat_index` and `is_host` to know which seed to render and whether to show the host-only Start/Reset buttons — JS in the browser can't read the HttpOnly cookie directly, so it asks the server.

Response shape: `{ playerId, seatIndex, isHost, roomId }`. 401 if no valid cookie.

- [ ] **Step 1: Write the failing test**

Create `app/api/rooms/[code]/me/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: vi.fn(),
}));

import { GET } from '../route';
import { getServiceClient } from '@/lib/supabase/server';
import { signSession } from '@/lib/auth/session';

const SECRET = 'test-secret-XXXXXXXXXXXXXXXXXXXXXXXXXX';

function req(code: string, cookieToken: string | null) {
  const headers: Record<string, string> = {};
  if (cookieToken) headers['cookie'] = `ct_player=${cookieToken}`;
  return new NextRequest(`http://localhost/api/rooms/${code}/me`, { method: 'GET', headers });
}

function mockSupabaseReturning(row: { id: string; seat_index: number | null; is_host: boolean } | null) {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  });
  return chain;
}

describe('GET /api/rooms/[code]/me', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.mocked(getServiceClient).mockReturnValue(mockSupabaseReturning({
      id: 'p1', seat_index: 2, is_host: true,
    }) as never);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns playerId/seatIndex/isHost from cookie + DB lookup', async () => {
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await GET(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      playerId: 'p1', roomId: 'r1', seatIndex: 2, isHost: true,
    });
  });

  it('401 when no cookie', async () => {
    const res = await GET(req('ABCD12', null), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(401);
  });

  it('401 when cookie tampered', async () => {
    const res = await GET(req('ABCD12', 'forged.value'), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(401);
  });

  it('400 when [code] is malformed', async () => {
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await GET(req('lowercase', token), { params: Promise.resolve({ code: 'lowercase' }) });
    expect(res.status).toBe(400);
  });

  it('404 when the cookie player no longer exists in the room', async () => {
    vi.mocked(getServiceClient).mockReturnValue(mockSupabaseReturning(null) as never);
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await GET(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run 'app/api/rooms/[code]/me/__tests__/route.test.ts'
```

- [ ] **Step 3: Implement `app/api/rooms/[code]/me/route.ts`**

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { readSessionCookie } from '@/lib/auth/session';
import { isValidRoomCode } from '@/lib/game/codes';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  if (!isValidRoomCode(code)) {
    return NextResponse.json({ error: { code: 'INVALID_SUBMIT', message: 'invalid room code' } }, { status: 400 });
  }

  const session = readSessionCookie(request);
  if (!session) {
    return NextResponse.json({ error: { code: 'INVALID_SUBMIT', message: 'no valid session' } }, { status: 401 });
  }

  const sb = getServiceClient();
  const { data, error } = await sb
    .from('players')
    .select('id, seat_index, is_host')
    .eq('id', session.playerId)
    .eq('room_id', session.roomId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message } }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: { code: 'ROOM_NOT_FOUND', message: 'player or room missing' } }, { status: 404 });
  }

  return NextResponse.json({
    playerId: session.playerId,
    roomId: session.roomId,
    seatIndex: (data as { seat_index: number | null }).seat_index,
    isHost: !!(data as { is_host: boolean }).is_host,
  });
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run 'app/api/rooms/[code]/me/__tests__/route.test.ts'
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit checkpoint**

```
feat(api): GET /api/rooms/[code]/me — current player from cookie

Page-level UIs use this to find their seat (so they know which seed
row to render) and whether they're host. Browser JS can't read the
HttpOnly cookie, so the server resolves it.
```

---

## Task 7: POST `/api/rooms/[code]/start` route handler

**Files:**
- Test: `app/api/rooms/[code]/start/__tests__/route.test.ts`
- Create: `app/api/rooms/[code]/start/route.ts`

Validates code + cookie, calls `startGame` from Task 5, returns `{ roundCount }`. The RPC does the host check; the route just translates errors.

- [ ] **Step 1: Write the failing test**

Create `app/api/rooms/[code]/start/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/game/round', () => ({ startGame: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));

import { POST } from '../route';
import { startGame } from '@/lib/game/round';
import { GameError } from '@/lib/game/errors';
import { signSession } from '@/lib/auth/session';

const SECRET = 'test-secret-XXXXXXXXXXXXXXXXXXXXXXXXXX';

function req(code: string, token: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['cookie'] = `ct_player=${token}`;
  return new NextRequest(`http://localhost/api/rooms/${code}/start`, { method: 'POST', headers });
}

describe('POST /api/rooms/[code]/start', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.mocked(startGame).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('200 + { roundCount } on success', async () => {
    vi.mocked(startGame).mockResolvedValue({ roundCount: 3 });
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ roundCount: 3 });
  });

  it('401 with no cookie', async () => {
    const res = await POST(req('ABCD12', null), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(401);
  });

  it('403 on NOT_HOST', async () => {
    vi.mocked(startGame).mockRejectedValue(new GameError('NOT_HOST', 'nope'));
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(403);
  });

  it('400 on NOT_ENOUGH_PLAYERS', async () => {
    vi.mocked(startGame).mockRejectedValue(new GameError('NOT_ENOUGH_PLAYERS', 'need 2'));
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(400);
  });

  it('400 when [code] is malformed', async () => {
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('lower', token), { params: Promise.resolve({ code: 'lower' }) });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run 'app/api/rooms/[code]/start/__tests__/route.test.ts'
```

- [ ] **Step 3: Implement `app/api/rooms/[code]/start/route.ts`**

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { startGame } from '@/lib/game/round';
import { getServiceClient } from '@/lib/supabase/server';
import { readSessionCookie } from '@/lib/auth/session';
import { GameError, ERROR_CODES, type ErrorCode } from '@/lib/game/errors';
import { isValidRoomCode } from '@/lib/game/codes';

function statusFor(code: ErrorCode): number {
  switch (code) {
    case ERROR_CODES.ROOM_NOT_FOUND: return 404;
    case ERROR_CODES.NOT_HOST: return 403;
    case ERROR_CODES.GAME_IN_PROGRESS: return 409;
    case ERROR_CODES.NOT_ENOUGH_PLAYERS: return 400;
    case ERROR_CODES.INVALID_SUBMIT: return 400;
    default: return 500;
  }
}
function envelope(code: ErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  if (!isValidRoomCode(code)) {
    return envelope('INVALID_SUBMIT', 'invalid room code in URL', 400);
  }
  const session = readSessionCookie(request);
  if (!session) {
    return NextResponse.json(
      { error: { code: 'INVALID_SUBMIT', message: 'no valid session cookie' } },
      { status: 401 },
    );
  }

  try {
    const result = await startGame({
      supabase: getServiceClient(),
      playerId: session.playerId,
      roomId: session.roomId,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GameError) return envelope(err.code, err.message, statusFor(err.code));
    console.error('[POST /api/rooms/[code]/start] unexpected', err);
    return envelope('INTERNAL', 'unexpected server error', 500);
  }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run 'app/api/rooms/[code]/start/__tests__/route.test.ts'
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit checkpoint**

```
feat(api): POST /api/rooms/[code]/start — host kicks off the game

Reads playerId from the signed cookie, delegates to startGame which
calls the start_game RPC. NOT_HOST → 403, NOT_ENOUGH_PLAYERS → 400.
```

---

## Task 8: POST `/api/rooms/[code]/submit` route handler

**Files:**
- Test: `app/api/rooms/[code]/submit/__tests__/route.test.ts`
- Create: `app/api/rooms/[code]/submit/route.ts`

Body: `{ content: string, language?: 'python'|'javascript'|'java' }`. Cookie owns `playerId` and `roomId`. The RPC validates everything else — phase, seat, double-submit. The route translates errors.

- [ ] **Step 1: Write the failing test**

Create `app/api/rooms/[code]/submit/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/game/round', () => ({ submitTurn: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));

import { POST } from '../route';
import { submitTurn } from '@/lib/game/round';
import { GameError } from '@/lib/game/errors';
import { signSession } from '@/lib/auth/session';

const SECRET = 'test-secret-XXXXXXXXXXXXXXXXXXXXXXXXXX';

function req(code: string, body: unknown, token: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['cookie'] = `ct_player=${token}`;
  return new NextRequest(`http://localhost/api/rooms/${code}/submit`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

describe('POST /api/rooms/[code]/submit', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.mocked(submitTurn).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('200 with advanced/newPhase/newRound on success', async () => {
    vi.mocked(submitTurn).mockResolvedValue({ advanced: true, newPhase: 'describing', newRound: 2 });
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', { content: 'x', language: 'python' }, token),
                           { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ advanced: true, newPhase: 'describing', newRound: 2 });
  });

  it('passes language=null when omitted (describe phase)', async () => {
    vi.mocked(submitTurn).mockResolvedValue({ advanced: false, newPhase: 'describing', newRound: 2 });
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', { content: 'this is text' }, token),
                           { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(vi.mocked(submitTurn)).toHaveBeenCalledWith({
      supabase: {}, playerId: 'p1', roomId: 'r1', content: 'this is text', language: null,
    });
  });

  it('400 when body has no content', async () => {
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', {}, token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(400);
  });

  it('400 INVALID_SUBMIT envelope on RPC reject', async () => {
    vi.mocked(submitTurn).mockRejectedValue(new GameError('INVALID_SUBMIT', 'already submitted'));
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', { content: 'x', language: 'python' }, token),
                           { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_SUBMIT');
  });

  it('401 when no cookie', async () => {
    const res = await POST(req('ABCD12', { content: 'x', language: 'python' }, null),
                           { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run 'app/api/rooms/[code]/submit/__tests__/route.test.ts'
```

- [ ] **Step 3: Implement `app/api/rooms/[code]/submit/route.ts`**

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { submitTurn } from '@/lib/game/round';
import { getServiceClient } from '@/lib/supabase/server';
import { readSessionCookie } from '@/lib/auth/session';
import { GameError, ERROR_CODES, type ErrorCode } from '@/lib/game/errors';
import { isValidRoomCode } from '@/lib/game/codes';

const LANGS: ReadonlyArray<'python' | 'javascript' | 'java'> = ['python', 'javascript', 'java'];

function statusFor(code: ErrorCode): number {
  switch (code) {
    case ERROR_CODES.ROOM_NOT_FOUND: return 404;
    case ERROR_CODES.INVALID_SUBMIT: return 400;
    default: return 500;
  }
}
function envelope(code: ErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  if (!isValidRoomCode(code)) {
    return envelope('INVALID_SUBMIT', 'invalid room code in URL', 400);
  }
  const session = readSessionCookie(request);
  if (!session) {
    return NextResponse.json(
      { error: { code: 'INVALID_SUBMIT', message: 'no valid session cookie' } },
      { status: 401 },
    );
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return envelope('INVALID_SUBMIT', 'body must be JSON', 400); }

  const b = body as { content?: unknown; language?: unknown };
  const content = typeof b?.content === 'string' ? b.content : null;
  if (!content || content.length === 0) {
    return envelope('INVALID_SUBMIT', 'content (string) is required', 400);
  }

  let language: 'python' | 'javascript' | 'java' | null = null;
  if (b?.language !== undefined && b.language !== null) {
    if (typeof b.language !== 'string' || !LANGS.includes(b.language as never)) {
      return envelope('INVALID_SUBMIT', 'language must be python/javascript/java', 400);
    }
    language = b.language as 'python' | 'javascript' | 'java';
  }

  try {
    const result = await submitTurn({
      supabase: getServiceClient(),
      playerId: session.playerId,
      roomId: session.roomId,
      content,
      language,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GameError) return envelope(err.code, err.message, statusFor(err.code));
    console.error('[POST /api/rooms/[code]/submit] unexpected', err);
    return envelope('INTERNAL', 'unexpected server error', 500);
  }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run 'app/api/rooms/[code]/submit/__tests__/route.test.ts'
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit checkpoint**

```
feat(api): POST /api/rooms/[code]/submit — player submits this round

Body: { content, language? }. playerId/roomId from cookie. submit_turn
RPC validates phase + seat + double-submit. INVALID_SUBMIT → 400 with
spec envelope.
```

---

## Task 9: POST `/api/rooms/[code]/reset` route handler

**Files:**
- Test: `app/api/rooms/[code]/reset/__tests__/route.test.ts`
- Create: `app/api/rooms/[code]/reset/route.ts`

Same shape as `start`. Host-only.

- [ ] **Step 1: Write the failing test**

Create `app/api/rooms/[code]/reset/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/game/round', () => ({ resetGame: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));

import { POST } from '../route';
import { resetGame } from '@/lib/game/round';
import { GameError } from '@/lib/game/errors';
import { signSession } from '@/lib/auth/session';

const SECRET = 'test-secret-XXXXXXXXXXXXXXXXXXXXXXXXXX';

function req(code: string, token: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['cookie'] = `ct_player=${token}`;
  return new NextRequest(`http://localhost/api/rooms/${code}/reset`, { method: 'POST', headers });
}

describe('POST /api/rooms/[code]/reset', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.mocked(resetGame).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('200 on success', async () => {
    vi.mocked(resetGame).mockResolvedValue({ ok: true });
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('403 on NOT_HOST', async () => {
    vi.mocked(resetGame).mockRejectedValue(new GameError('NOT_HOST', 'nope'));
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(403);
  });

  it('401 with no cookie', async () => {
    const res = await POST(req('ABCD12', null), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(401);
  });

  it('400 when [code] is malformed', async () => {
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('lower', token), { params: Promise.resolve({ code: 'lower' }) });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run 'app/api/rooms/[code]/reset/__tests__/route.test.ts'
```

- [ ] **Step 3: Implement `app/api/rooms/[code]/reset/route.ts`**

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { resetGame } from '@/lib/game/round';
import { getServiceClient } from '@/lib/supabase/server';
import { readSessionCookie } from '@/lib/auth/session';
import { GameError, ERROR_CODES, type ErrorCode } from '@/lib/game/errors';
import { isValidRoomCode } from '@/lib/game/codes';

function statusFor(code: ErrorCode): number {
  switch (code) {
    case ERROR_CODES.ROOM_NOT_FOUND: return 404;
    case ERROR_CODES.NOT_HOST: return 403;
    case ERROR_CODES.INVALID_SUBMIT: return 400;
    default: return 500;
  }
}
function envelope(code: ErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  if (!isValidRoomCode(code)) {
    return envelope('INVALID_SUBMIT', 'invalid room code in URL', 400);
  }
  const session = readSessionCookie(request);
  if (!session) {
    return NextResponse.json(
      { error: { code: 'INVALID_SUBMIT', message: 'no valid session cookie' } },
      { status: 401 },
    );
  }

  try {
    const result = await resetGame({
      supabase: getServiceClient(),
      playerId: session.playerId,
      roomId: session.roomId,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GameError) return envelope(err.code, err.message, statusFor(err.code));
    console.error('[POST /api/rooms/[code]/reset] unexpected', err);
    return envelope('INTERNAL', 'unexpected server error', 500);
  }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run 'app/api/rooms/[code]/reset/__tests__/route.test.ts'
```

Expected: 4 tests pass.

- [ ] **Step 5: Full suite**

```bash
npx vitest run && npx tsc --noEmit
```

- [ ] **Step 6: Commit checkpoint**

```
feat(api): POST /api/rooms/[code]/reset — host returns room to lobby

Delegates to reset_game RPC. Clears submissions + chain_scores +
seat_index in one transaction. Host-only.
```

---

## Task 10: Wire `/waiting-room/[code]` — Start button + phase-change navigation

**Files:**
- Modify: `app/waiting-room/[code]/page.jsx`

Two changes:
1. The Start button is currently disabled. Enable it for host when `players.length >= 2`. On click, POST `/api/rooms/[code]/start`. On non-2xx, show the error briefly (alert is fine for the demo).
2. Add an effect that watches `room.phase`. When it changes to `writing`, `describing`, etc., `router.replace` to the corresponding page.

We'll need the player's `isHost` flag. Fetch from `/api/rooms/[code]/me` on mount, store in state.

- [ ] **Step 1: Read the current waiting-room page**

```bash
cat app/waiting-room/\[code\]/page.jsx
```

Note the current `useRoom` call shape and where the Leave button is wired. The Start button currently sits inside the same `<footer>` and has `variant="primary" disabled`.

- [ ] **Step 2: Add `useMe` hook above the page component**

In `app/waiting-room/[code]/page.jsx`, above the default export, add:

```javascript
function useMe(code) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/me`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMe(data);
      } catch (err) {
        console.error("[lobby] /me fetch failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);
  return me;
}
```

Also add the import at the top: `useState`, `useEffect` are already imported via `"react"` — confirm and add if missing.

- [ ] **Step 3: Add phase-change navigation**

Define a `routeForPhase` helper above the component:

```javascript
function routeForPhase(phase, code) {
  switch (phase) {
    case "writing":         return `/editor/${code}`;
    case "describing":      return `/describe/${code}`;
    case "reimplementing":  return `/reimplement/${code}`;
    case "reveal":          return `/reveal/${code}`;
    default:                return null;
  }
}
```

Inside `WaitingRoom`, after the existing `useRoom` and `useEffect` for `notFound`, add:

```javascript
useEffect(() => {
  if (!room || !code) return;
  const target = routeForPhase(room.phase, code);
  if (target) router.replace(target);
}, [room?.phase, code, router]);
```

This same effect lives on each game screen in Tasks 11–14 so phase changes mid-game move everyone forward.

- [ ] **Step 4: Wire the Start button**

Replace the `<Button variant="primary" disabled> Start Game </Button>` near the bottom with:

```javascript
<Button
  variant="primary"
  disabled={!me?.isHost || players.length < 2}
  onClick={async () => {
    try {
      const res = await fetch(`/api/rooms/${code}/start`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Start failed: ${err.error?.message ?? res.status}`);
      }
      // Success: phase will flip via Realtime; the useEffect above navigates.
    } catch (err) {
      console.error("[lobby] start failed:", err);
    }
  }}
>
  Start Game
</Button>
```

Update `me` integration: call the hook near the top of the component, `const me = useMe(code);`.

Also update the host-note hint text to reflect the new state:

```javascript
<span className={styles.hostNote}>
  {loading
    ? "Loading…"
    : me?.isHost
      ? (players.length < 2 ? "Need at least 2 players to start." : "You're the host — start when ready.")
      : "Waiting for host to start."}
</span>
```

- [ ] **Step 5: Manual smoke**

Start dev:

```bash
npm run dev > /tmp/dev.log 2>&1 &
```

Open two browser tabs, create from one, join from the other. Click Start. Expected: both tabs navigate to `/editor/[code]` within ~1s (Realtime fan-out).

If only one tab navigates, the other's `useRoom` may not be receiving the phase UPDATE — open dev tools console to check.

Kill dev: `pkill -9 next-server; pkill -9 -f "next dev"`

- [ ] **Step 6: Type-check + tests**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 7: Commit checkpoint**

```
feat(waiting-room): wire Start button + phase-change navigation

useMe pulls the player's isHost flag from /api/rooms/[code]/me. Start
button POSTs /start and lets the Realtime UPDATE on rooms.phase drive
navigation (every client lands on the same screen). Same useEffect
lives on the game screens in Tasks 11-14 so mid-game transitions work.
```

---

## Task 11: Move + rewire `/editor/[code]/page.jsx`

**Files:**
- Move: `app/editor/page.jsx` → `app/editor/[code]/page.jsx`
- Move: `app/editor/page.module.css` → `app/editor/[code]/page.module.css`
- Rewrite: `app/editor/[code]/page.jsx`

The editor page is round 1 (`writing`). Each player reads their seed (round 0 submission for their chain) and writes code.

- [ ] **Step 1: Move with history preserved**

```bash
mkdir -p 'app/editor/[code]'
git mv app/editor/page.jsx 'app/editor/[code]/page.jsx'
git mv app/editor/page.module.css 'app/editor/[code]/page.module.css'
```

- [ ] **Step 2: Replace the file content**

Overwrite `app/editor/[code]/page.jsx` with:

```javascript
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import LanguagePicker from "@/components/game/LanguagePicker";
import Button from "@/components/input/Button";
import { useRoom } from "@/lib/realtime/useRoom";
import { chainForPlayer } from "@/lib/game/seating";
import styles from "./page.module.css";

function useRoomIdFromCode(code) {
  const [roomId, setRoomId] = useState(null);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      const { getBrowserClient } = await import("@/lib/supabase/browser");
      const sb = getBrowserClient();
      const { data, error } = await sb
        .from("rooms").select("id").eq("code", code).maybeSingle();
      if (cancelled) return;
      if (error || !data) { setNotFound(true); return; }
      setRoomId(data.id);
    })();
    return () => { cancelled = true; };
  }, [code]);
  return { roomId, notFound };
}

function useMe(code) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/me`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMe(data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [code]);
  return me;
}

function routeForPhase(phase, code) {
  switch (phase) {
    case "lobby":           return `/waiting-room/${code}`;
    case "describing":      return `/describe/${code}`;
    case "reimplementing":  return `/reimplement/${code}`;
    case "reveal":          return `/reveal/${code}`;
    default:                return null;
  }
}

const FALLBACK_PROMPT = "Waiting for prompt…";
const FALLBACK_STARTER = "# write your solution here\n";

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();

  const { roomId, notFound } = useRoomIdFromCode(code);
  const { room, players, submissions, loading, error } = useRoom(roomId);
  const me = useMe(code);

  // Phase navigation: if we're on /editor but the room moved on, follow.
  useEffect(() => {
    if (!room || !code) return;
    const target = routeForPhase(room.phase, code);
    if (target) router.replace(target);
  }, [room?.phase, code, router]);

  // Room missing → home.
  useEffect(() => { if (notFound) router.replace("/"); }, [notFound, router]);

  const playerCount = players.length;
  const round = room?.current_round ?? 1;
  const seatIndex = me?.seatIndex;

  // The seed we render: round (round - 1), chain = chainForPlayer(seat, round, N).
  // For round 1 this is the round-0 prompt for the player's chain.
  const myChain = (typeof seatIndex === "number" && playerCount > 0)
    ? chainForPlayer(seatIndex, round, playerCount)
    : null;
  const seedRow = myChain != null
    ? submissions.find((s) => s.round_num === round - 1 && s.chain_index === myChain)
    : null;
  const promptText = seedRow?.content ?? FALLBACK_PROMPT;

  // Did I already submit this round?
  const hasSubmitted = me?.playerId
    ? submissions.some((s) => s.round_num === round && s.author_id === me.playerId)
    : false;

  // Hardcoded for the demo (Plan 4+ can wire LanguagePicker properly).
  const [language] = useState("python");
  const [editorValue, setEditorValue] = useState(FALLBACK_STARTER);

  const submittedCount = submissions.filter((s) => s.round_num === round).length;

  const handleSubmit = async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: editorValue, language }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Submit failed: ${err.error?.message ?? res.status}`);
      }
      // On success the next phase arrives via Realtime → useEffect navigates.
    } catch (err) {
      console.error("[editor] submit failed:", err);
    }
  };

  if (loading || !room) {
    return <div className={styles.stage}>Loading…</div>;
  }

  return (
    <div className={styles.stage}>
      <Window
        title={`Code Telephone — Round ${round} — Write Phase`}
        width={920}
        menubar={
          <div className={styles.menu}>
            <span>File</span><span>Edit</span><span>View</span><span>Help</span>
          </div>
        }
      >
        <div className={styles.body}>
          <header className={styles.phaseHeader}>
            <div>
              <div className={styles.phaseLabel}>Phase 1 of {(room.round_count ?? 3)}</div>
              <div className={styles.phaseTitle}>Write the function</div>
            </div>
            <div className={styles.timer}>
              <span className={styles.timerLabel}>Time left</span>
              <span className={styles.timerValue}>—:—</span>
            </div>
          </header>

          {error && <div role="alert">Realtime error: {error}</div>}

          <section className={styles.prompt}>
            <div className={styles.promptLabel}>Prompt</div>
            <p className={styles.promptText}>{promptText}</p>
          </section>

          <div className={styles.editorWrap}>
            <LanguagePicker value={language} disabled name="editor-language" />
            <CodeEditor
              value={editorValue}
              onChange={setEditorValue}
              language={language}
              fileName="solution"
              height={380}
            />
          </div>

          <footer className={styles.actions}>
            <span className={styles.flex} />
            <span className={styles.readyCount}>{submittedCount} of {playerCount} submitted</span>
            <Button variant="primary" disabled={hasSubmitted} onClick={handleSubmit}>
              {hasSubmitted ? "Waiting…" : "Submit"}
            </Button>
          </footer>
        </div>
      </Window>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit checkpoint**

```
feat(editor): wire /editor/[code] — read seed, submit code

Reads the player's round-0 seed via seat math, posts content to
/submit. hasSubmitted derives from the player's own submission row in
the current round. Phase change in the room triggers router.replace
to the next screen. Language hard-coded to python (Plan 4 can wire
LanguagePicker).
```

---

## Task 12: Move + rewire `/describe/[code]/page.jsx`

**Files:**
- Move: `app/describe/page.jsx` → `app/describe/[code]/page.jsx`
- Move: `app/describe/page.module.css` → `app/describe/[code]/page.module.css`
- Rewrite: `app/describe/[code]/page.jsx`

Describe phase: read the previous round's code (the chain partner's submission), write English description in the Notepad, submit. Pattern matches the editor but the seed is *code*, the output is *text*, and `language` is omitted in the POST body.

- [ ] **Step 1: Move the files**

```bash
mkdir -p 'app/describe/[code]'
git mv app/describe/page.jsx 'app/describe/[code]/page.jsx'
git mv app/describe/page.module.css 'app/describe/[code]/page.module.css'
```

- [ ] **Step 2: Replace the file content**

Overwrite `app/describe/[code]/page.jsx` with:

```javascript
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import Notepad from "@/components/notepad/Notepad";
import PhaseHUD from "@/components/game/PhaseHUD";
import { useRoom } from "@/lib/realtime/useRoom";
import { chainForPlayer } from "@/lib/game/seating";
import styles from "./page.module.css";

function useRoomIdFromCode(code) {
  const [roomId, setRoomId] = useState(null);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      const { getBrowserClient } = await import("@/lib/supabase/browser");
      const sb = getBrowserClient();
      const { data, error } = await sb
        .from("rooms").select("id").eq("code", code).maybeSingle();
      if (cancelled) return;
      if (error || !data) { setNotFound(true); return; }
      setRoomId(data.id);
    })();
    return () => { cancelled = true; };
  }, [code]);
  return { roomId, notFound };
}

function useMe(code) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/me`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMe(data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [code]);
  return me;
}

function routeForPhase(phase, code) {
  switch (phase) {
    case "lobby":           return `/waiting-room/${code}`;
    case "writing":         return `/editor/${code}`;
    case "reimplementing":  return `/reimplement/${code}`;
    case "reveal":          return `/reveal/${code}`;
    default:                return null;
  }
}

const FALLBACK_CODE = "# waiting for the previous player's code…\n";
const NOTEPAD_PLACEHOLDER = "Describe what this function does in plain English.";

export default function DescribePage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();

  const { roomId, notFound } = useRoomIdFromCode(code);
  const { room, players, submissions, loading, error } = useRoom(roomId);
  const me = useMe(code);

  useEffect(() => {
    if (!room || !code) return;
    const target = routeForPhase(room.phase, code);
    if (target) router.replace(target);
  }, [room?.phase, code, router]);

  useEffect(() => { if (notFound) router.replace("/"); }, [notFound, router]);

  const playerCount = players.length;
  const round = room?.current_round ?? 2;
  const seatIndex = me?.seatIndex;
  const myChain = (typeof seatIndex === "number" && playerCount > 0)
    ? chainForPlayer(seatIndex, round, playerCount)
    : null;
  const seedRow = myChain != null
    ? submissions.find((s) => s.round_num === round - 1 && s.chain_index === myChain)
    : null;
  const receivedCode = seedRow?.content ?? FALLBACK_CODE;
  const language = seedRow?.language ?? "python";

  const hasSubmitted = me?.playerId
    ? submissions.some((s) => s.round_num === round && s.author_id === me.playerId)
    : false;
  const submittedCount = submissions.filter((s) => s.round_num === round).length;

  const [description, setDescription] = useState("");
  const [topWindow, setTopWindow] = useState("notepad");

  const handleSubmit = async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Submit failed: ${err.error?.message ?? res.status}`);
      }
    } catch (err) {
      console.error("[describe] submit failed:", err);
    }
  };

  if (loading || !room) return <div className={styles.stage}>Loading…</div>;

  return (
    <div className={styles.stage}>
      <PhaseHUD
        phaseIndex={2}
        phaseTotal={room.round_count ?? 3}
        title="Describe the function"
        timer="—:—"
        readyCount={`${submittedCount} of ${playerCount} submitted`}
        submitLabel={hasSubmitted ? "Waiting…" : "Submit description"}
        onSubmit={hasSubmitted ? undefined : handleSubmit}
      />

      {error && <div role="alert">Realtime error: {error}</div>}

      <div className={styles.codeWindow}>
        <Window
          title="mystery.py — Code Telephone"
          x={56}
          y={88}
          width={560}
          height={460}
          zIndex={topWindow === "code" ? 2 : 1}
          onActivate={() => setTopWindow("code")}
          draggable
        >
          <CodeEditor
            value={receivedCode}
            language={language}
            fileName="mystery"
            readOnly
            height={428}
            showStatusBar
          />
        </Window>
      </div>

      <div className={styles.notepadWindow}>
        <Notepad
          fileName="Untitled"
          value={description}
          onChange={setDescription}
          placeholder={NOTEPAD_PLACEHOLDER}
          x={640}
          y={88}
          width={440}
          height={460}
          zIndex={topWindow === "notepad" ? 2 : 1}
          onActivate={() => setTopWindow("notepad")}
          draggable
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit checkpoint**

```
feat(describe): wire /describe/[code] — read code, write description

Reads the previous round's code submission for this player's chain
(seat math). Submits with language omitted (the RPC enforces that).
```

---

## Task 13: Move + rewire `/reimplement/[code]/page.jsx`

**Files:**
- Move: `app/reimplement/page.jsx` → `app/reimplement/[code]/page.jsx`
- Move: `app/reimplement/page.module.css` → `app/reimplement/[code]/page.module.css`
- Rewrite: `app/reimplement/[code]/page.jsx`

Mirror of `/describe`: read previous round's description, write code, submit with `language`.

- [ ] **Step 1: Move the files**

```bash
mkdir -p 'app/reimplement/[code]'
git mv app/reimplement/page.jsx 'app/reimplement/[code]/page.jsx'
git mv app/reimplement/page.module.css 'app/reimplement/[code]/page.module.css'
```

- [ ] **Step 2: Replace the file content**

Overwrite `app/reimplement/[code]/page.jsx` with:

```javascript
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Notepad from "@/components/notepad/Notepad";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import LanguagePicker from "@/components/game/LanguagePicker";
import PhaseHUD from "@/components/game/PhaseHUD";
import { useRoom } from "@/lib/realtime/useRoom";
import { chainForPlayer } from "@/lib/game/seating";
import styles from "./page.module.css";

function useRoomIdFromCode(code) {
  const [roomId, setRoomId] = useState(null);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      const { getBrowserClient } = await import("@/lib/supabase/browser");
      const sb = getBrowserClient();
      const { data, error } = await sb
        .from("rooms").select("id").eq("code", code).maybeSingle();
      if (cancelled) return;
      if (error || !data) { setNotFound(true); return; }
      setRoomId(data.id);
    })();
    return () => { cancelled = true; };
  }, [code]);
  return { roomId, notFound };
}

function useMe(code) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/me`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMe(data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [code]);
  return me;
}

function routeForPhase(phase, code) {
  switch (phase) {
    case "lobby":      return `/waiting-room/${code}`;
    case "writing":    return `/editor/${code}`;
    case "describing": return `/describe/${code}`;
    case "reveal":     return `/reveal/${code}`;
    default:           return null;
  }
}

const FALLBACK_DESCRIPTION = "Waiting for the previous player's description…";

export default function ReimplementPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();

  const { roomId, notFound } = useRoomIdFromCode(code);
  const { room, players, submissions, loading, error } = useRoom(roomId);
  const me = useMe(code);

  useEffect(() => {
    if (!room || !code) return;
    const target = routeForPhase(room.phase, code);
    if (target) router.replace(target);
  }, [room?.phase, code, router]);

  useEffect(() => { if (notFound) router.replace("/"); }, [notFound, router]);

  const playerCount = players.length;
  const round = room?.current_round ?? 3;
  const seatIndex = me?.seatIndex;
  const myChain = (typeof seatIndex === "number" && playerCount > 0)
    ? chainForPlayer(seatIndex, round, playerCount)
    : null;
  const seedRow = myChain != null
    ? submissions.find((s) => s.round_num === round - 1 && s.chain_index === myChain)
    : null;
  const receivedDescription = seedRow?.content ?? FALLBACK_DESCRIPTION;

  const hasSubmitted = me?.playerId
    ? submissions.some((s) => s.round_num === round && s.author_id === me.playerId)
    : false;
  const submittedCount = submissions.filter((s) => s.round_num === round).length;

  const [language] = useState("python");
  const [reconstructedCode, setReconstructedCode] = useState("");

  const handleSubmit = async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: reconstructedCode, language }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Submit failed: ${err.error?.message ?? res.status}`);
      }
    } catch (err) {
      console.error("[reimplement] submit failed:", err);
    }
  };

  if (loading || !room) return <div className={styles.stage}>Loading…</div>;

  const solutionExt = language === "javascript" ? "js" : language === "java" ? "java" : "py";

  return (
    <div className={styles.stage}>
      <PhaseHUD
        phaseIndex={3}
        phaseTotal={room.round_count ?? 3}
        title="Re-implement the function"
        timer="—:—"
        readyCount={`${submittedCount} of ${playerCount} submitted`}
        submitLabel={hasSubmitted ? "Waiting…" : "Submit code"}
        onSubmit={hasSubmitted ? undefined : handleSubmit}
      />

      {error && <div role="alert">Realtime error: {error}</div>}

      <div className={styles.descWindow}>
        <Notepad
          fileName="received"
          value={receivedDescription}
          readOnly
          x={56}
          y={88}
          width={440}
          height={460}
        />
      </div>

      <div className={styles.codeWindow}>
        <Window
          title={`solution.${solutionExt} — Code Telephone`}
          x={520}
          y={88}
          width={580}
          height={460}
        >
          <LanguagePicker value={language} disabled name="reimplement-language" />
          <CodeEditor
            value={reconstructedCode}
            onChange={setReconstructedCode}
            language={language}
            fileName="solution"
            height={428}
            showStatusBar
          />
        </Window>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit checkpoint**

```
feat(reimplement): wire /reimplement/[code] — read description, write code

Same seat math as /describe but inverted: read previous round's
'describe' content, post 'code' with language.
```

---

## Task 14: Move + rewire `/reveal/[code]/page.jsx` (chains only)

**Files:**
- Move: `app/reveal/page.jsx` → `app/reveal/[code]/page.jsx`
- Move: `app/reveal/page.module.css` → `app/reveal/[code]/page.module.css`
- Rewrite: `app/reveal/[code]/page.jsx`

Reveal shows each chain end-to-end: prompt → code → description → code → ... up to round `round_count`. **Scoring is Plan 4** — leave the score area with a placeholder.

- [ ] **Step 1: Move the files**

```bash
mkdir -p 'app/reveal/[code]'
git mv app/reveal/page.jsx 'app/reveal/[code]/page.jsx'
git mv app/reveal/page.module.css 'app/reveal/[code]/page.module.css'
```

- [ ] **Step 2: Replace the file content**

Overwrite `app/reveal/[code]/page.jsx` with:

```javascript
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import CodeEditor from "@/components/game/CodeEditor";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import { useRoom } from "@/lib/realtime/useRoom";
import styles from "./page.module.css";

function useRoomIdFromCode(code) {
  const [roomId, setRoomId] = useState(null);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      const { getBrowserClient } = await import("@/lib/supabase/browser");
      const sb = getBrowserClient();
      const { data, error } = await sb
        .from("rooms").select("id").eq("code", code).maybeSingle();
      if (cancelled) return;
      if (error || !data) { setNotFound(true); return; }
      setRoomId(data.id);
    })();
    return () => { cancelled = true; };
  }, [code]);
  return { roomId, notFound };
}

function useMe(code) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/me`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMe(data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [code]);
  return me;
}

function initialsOf(name) {
  if (!name) return "??";
  return name.slice(0, 2).toUpperCase();
}

function roleLabelOf(roundType) {
  return roundType === "code" ? "Code" : "Desc";
}

/** Group submissions by chain_index and order by round_num ascending. */
function chainsFromSubmissions(submissions, players) {
  const playersById = new Map(players.map((p) => [p.id, p]));
  const byChain = new Map();
  for (const sub of submissions) {
    if (!byChain.has(sub.chain_index)) byChain.set(sub.chain_index, []);
    byChain.get(sub.chain_index).push(sub);
  }
  const chains = [];
  for (const [chainIndex, segments] of [...byChain.entries()].sort((a, b) => a[0] - b[0])) {
    segments.sort((a, b) => a.round_num - b.round_num);
    chains.push({
      chainIndex,
      segments: segments.map((s) => ({
        ...s,
        authorName: s.author_id ? (playersById.get(s.author_id)?.name ?? "?") : "Prompt",
      })),
    });
  }
  return chains;
}

export default function RevealPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();

  const { roomId, notFound } = useRoomIdFromCode(code);
  const { room, players, submissions, loading, error } = useRoom(roomId);
  const me = useMe(code);

  useEffect(() => {
    if (!room || !code) return;
    // If somehow the room is back in lobby or active phases, leave reveal.
    if (room.phase === "lobby") router.replace(`/waiting-room/${code}`);
  }, [room?.phase, code, router]);

  useEffect(() => { if (notFound) router.replace("/"); }, [notFound, router]);

  const chains = chainsFromSubmissions(submissions, players);

  // Default to viewing the chain the current player kicked off (seed seat).
  const [viewerChainIndex, setViewerChainIndex] = useState(0);
  useEffect(() => {
    if (typeof me?.seatIndex === "number") setViewerChainIndex(me.seatIndex);
  }, [me?.seatIndex]);

  const chain = chains.find((c) => c.chainIndex === viewerChainIndex) ?? chains[0] ?? null;
  const originalSegment = chain?.segments?.[0] ?? null;
  const reconstructedSegment = chain
    ? [...(chain.segments ?? [])].reverse().find((s) => s.round_type === "code") ?? null
    : null;

  const handlePlayAgain = async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}/reset`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Reset failed: ${err.error?.message ?? res.status}`);
      }
    } catch (err) {
      console.error("[reveal] reset failed:", err);
    }
  };

  if (loading || !room) return <div className={styles.stage}>Loading…</div>;

  return (
    <div className={styles.stage}>
      <Window title="Code Telephone — Round Reveal" width={900} height={700}>
        <div className={styles.body}>
          {error && <div role="alert">Realtime error: {error}</div>}

          {!chain || !originalSegment ? (
            <p className={styles.emptyMessage}>No reveal data yet.</p>
          ) : (
            <>
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Viewing chain {chain.chainIndex + 1} of {chains.length}</h2>
                <div className={styles.chain}>
                  {chain.segments.map((seg, i) => (
                    <span key={`seg-${seg.round_num}-${i}`}>
                      <div className={styles.chainNode}>
                        <PlayerAvatar initials={initialsOf(seg.authorName)} seed={seg.authorName} />
                        <span className={styles.chainNodeName}>{seg.authorName}</span>
                        <span className={styles.chainNodeLabel}>{roleLabelOf(seg.round_type)}</span>
                      </div>
                      {i < chain.segments.length - 1 && (
                        <span className={styles.chainArrow} aria-hidden>→</span>
                      )}
                    </span>
                  ))}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.diff}>
                  <div className={styles.diffPanel}>
                    <span className={styles.diffHeader}>
                      Original prompt <strong>(seed)</strong>
                    </span>
                    <CodeEditor
                      value={originalSegment.content ?? ""}
                      language={originalSegment.language ?? "python"}
                      fileName="prompt"
                      readOnly
                      height={220}
                      showStatusBar={false}
                    />
                  </div>
                  {reconstructedSegment && (
                    <div className={styles.diffPanel}>
                      <span className={styles.diffHeader}>
                        Reconstructed <strong>({reconstructedSegment.authorName})</strong>
                      </span>
                      <CodeEditor
                        value={reconstructedSegment.content ?? ""}
                        language={reconstructedSegment.language ?? "python"}
                        fileName="reconstructed"
                        readOnly
                        height={220}
                        showStatusBar={false}
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* Score placeholder — Plan 4 will wire chain_scores Realtime here */}
              <section className={styles.section}>
                <p className={styles.emptyMessage}>
                  AI scoring lands in Plan 4. For now, scroll the chain above.
                </p>
              </section>

              {chains.length > 1 && (
                <section className={styles.section}>
                  <div className={styles.chainPicker ?? ""}>
                    {chains.map((c) => (
                      <Button
                        key={c.chainIndex}
                        onClick={() => setViewerChainIndex(c.chainIndex)}
                      >
                        Chain {c.chainIndex + 1}{c.chainIndex === viewerChainIndex ? " ✓" : ""}
                      </Button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          <footer className={styles.footer}>
            <Button variant="primary" disabled={!me?.isHost} onClick={handlePlayAgain}>
              Play again
            </Button>
          </footer>
        </div>
      </Window>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit checkpoint**

```
feat(reveal): wire /reveal/[code] — chain visualization (no scoring yet)

Groups submissions by chain_index, sorts by round_num. Picks default
viewer chain = current player's seat (the prompt they started with).
Play again button → /api/rooms/[code]/reset (host-only). Scoring UI is
a placeholder; Plan 4 binds chain_scores via Realtime.
```

---

## Task 15: Verify Plan 3 exit criteria — 3-tab manual smoke

**Files:**
- Read-only.

The spec's Step 3 exit criterion: "3-player chain flows through to /reveal with no scores yet."

- [ ] **Step 1: Confirm DB state**

```bash
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2 | tr -d '\r' | sed 's:/$::')
KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2 | tr -d '\r')
echo "rpcs:" && curl -sS -X POST "$URL/rest/v1/rpc/start_game" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d '{"p_player_id":"00000000-0000-0000-0000-000000000000","p_room_id":"00000000-0000-0000-0000-000000000000"}'
```

Expected: an error like `ROOM_NOT_FOUND: no such room` — confirms the RPC exists and is reachable. (Anything other than a missing-function error is fine.)

- [ ] **Step 2: Tests + tsc green**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all tests pass; tsc exit 0.

- [ ] **Step 3: Manual three-tab smoke**

Open three browser windows (one normal + two incognito, or three Chrome profiles — cookies must be independent).

| Step | Tab A | Tab B | Tab C | Expected |
|---|---|---|---|---|
| 1 | go to `/`, create as "Alice" | — | — | lobby `/waiting-room/<CODE>` shows Alice (host) |
| 2 | — | join with `<CODE>` as "Bob" | — | both tabs show Alice + Bob |
| 3 | — | — | join with `<CODE>` as "Carol" | all three tabs show 3 players |
| 4 | click **Start Game** | — | — | all three tabs navigate to `/editor/<CODE>` within ~1s |
| 5 | type code, **Submit** | type code, **Submit** | type code, **Submit** | all tabs navigate to `/describe/<CODE>` after the third submit |
| 6 | type description, **Submit description** | same | same | all tabs navigate to `/reimplement/<CODE>` |
| 7 | type code, **Submit code** | same | same | all tabs navigate to `/reveal/<CODE>` |
| 8 | inspect | inspect | inspect | reveal shows 3 chains (one per starting seat), each with 4 segments: prompt → code → description → code |

If any tab fails to navigate after a phase transition, the issue is almost always Realtime — verify `submissions` is in the publication (`SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'`).

- [ ] **Step 4: Spot-check the DB**

```sql
SELECT room_id, round_num, chain_index, round_type, length(content)
FROM submissions
WHERE room_id = (SELECT id FROM rooms WHERE code = '<CODE>')
ORDER BY round_num, chain_index;
-- Expected: 12 rows (round_count=3 → rounds 0..3, 3 chains = 4 × 3 = 12).

SELECT room_id, chain_index, status FROM chain_scores
WHERE room_id = (SELECT id FROM rooms WHERE code = '<CODE>');
-- Expected: 3 rows, all status='pending'. Plan 4 flips them to 'done'.
```

- [ ] **Step 5: Final commit (if anything was tweaked)**

If the smoke surfaced fixes, commit them.

Suggested message:

```
chore: verify Plan 3 exit criteria

- 3-tab smoke through writing→describing→reimplementing→reveal
- DB shows 12 submission rows + 3 pending chain_scores per game
- All phase transitions arrive live via Realtime
```

---

## Plan 3 — Exit criteria

After this plan is complete:

- Host can start a game from `/waiting-room/[code]`.
- All clients navigate together through writing → describing → reimplementing → reveal as the `rooms.phase` flips.
- Each player sees their seat's seed at every phase (seat math correct).
- Submitting respects double-submit prevention and round-completion atomicity (RPC + UNIQUE constraint).
- `/reveal/[code]` renders the full chain for each starting seat with a chain picker.
- `chain_scores` rows are seeded with `status='pending'` at reveal transition — Plan 4 fills them in.
- Reset (host-only) returns the room to lobby state, clearing all submissions and chain_scores.
- Vitest suite green; tsc clean.

Plan 4 builds on this:
- `lib/judge/gemini.ts` + recorded-response snapshot test.
- `lib/game/judging.ts` — `judgeRoom(roomId)` orchestrator.
- `POST /api/judge/[roomId]` — fire-and-forget via `after()`.
- `/reveal/[code]` subscribes to `chain_scores`, animates scores in.

Plan 5 then adds Judge0, the Vercel deploy, and one Playwright smoke.

## Self-review notes

**Spec coverage for Step 3 (Round mechanic):**
- ✓ Port `manager.py` → TS (`lib/game/seating.ts` + the three RPCs in `009_round_rpcs_and_realtime.sql`; the RPCs replace `manager.py`'s in-memory state machine with transactional Postgres logic).
- ✓ `app/api/rooms/[code]/start/route.ts` (Task 7), `.../submit/route.ts` (Task 8), `.../reset/route.ts` (Task 9).
- ✓ `/editor`, `/describe`, `/reimplement` wired to Realtime + POST `/submit` (Tasks 11–13).
- ✓ Vitest tests for seating + submit predicate (Tasks 2, 5, 8 cover the math, the RPC wrapper, and the route's validation).
- ✓ 3-player chain flows through to `/reveal` with no scores yet (Task 15 manual smoke).

**Race-condition coverage:**
- `submit_turn` SELECTs the room row FOR UPDATE, so two simultaneous submits serialize.
- The UNIQUE(room_id, round_num, chain_index) constraint catches double-submits even if the seat-derived chain_index were ever wrong.
- `start_game` and `reset_game` also lock the room row.

**Type consistency:**
- `Phase` defined once in `lib/game/seating.ts`; reused.
- `SubmissionRow` defined once in `lib/realtime/useRoom.ts` and matches the schema column-for-column.
- Route handlers reuse the same `statusFor`/`envelope` shape introduced in Plan 2's route handlers.

**Placeholder scan:** no "TBD"/"implement later" / "Similar to Task N" / "appropriate error handling" anywhere.

**Known gaps and deferrals:**
- Per-phase timers: deferred (spec says optional for demo).
- Draft autosave: deferred. The old localStorage helpers from `lib/socket/session.js` are gone; players who refresh mid-round lose their current draft.
- Language picker is cosmetic — every submit hard-codes `python` for code rounds. Plan 4 or beyond can wire it.
- ELO and account integration: out of scope (spec defers indefinitely).
- The `/api/rooms/[code]/me` route has no caching — each page mounts a fetch. Acceptable for the demo.
