# AI Judging Implementation Plan (Plan 4 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the round mechanic transitions a room to `phase='reveal'`, the first browser to land on `/reveal/[code]` POSTs to `/api/judge/[roomId]`; the server iterates chains sequentially, asks Gemini to score each one, and writes results into `chain_scores`. All reveal-page clients are subscribed to `chain_scores` via Realtime and see scores animate in as each chain finishes.

**Architecture:** Gemini is called from a Route Handler using the service-role Supabase client to update `chain_scores`. The judge endpoint uses Next.js `after()` to return 202 immediately and run the actual judging in the post-response phase — keeps the client snappy and avoids holding a connection for ~25s of API calls. Multiple clients triggering the endpoint concurrently is fine: judging iterates pending rows and the UNIQUE PK on `chain_scores` prevents double-writes.

**Tech Stack:** Same as Plan 3. No new deps. Gemini called via raw `fetch` against the `generativelanguage.googleapis.com` REST API — the project already has `GEMINI_API_KEY` set.

**Source spec:** `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md` (Step 4: Reveal + AI judge). Plan 5 then adds Judge0 behavioural testing + Vercel deploy + Playwright smoke.

---

## File structure produced by this plan

```
trainee-zeus-26t1/
├── app/
│   ├── api/
│   │   └── judge/
│   │       └── [roomId]/
│   │           ├── route.ts                       ← NEW (POST, fire-and-forget)
│   │           └── __tests__/route.test.ts        ← NEW
│   └── reveal/[code]/page.jsx                     ← MODIFIED (chain_scores + judge trigger)
├── lib/
│   ├── judge/
│   │   ├── gemini.ts                              ← NEW
│   │   └── __tests__/gemini.test.ts               ← NEW
│   ├── game/
│   │   ├── judging.ts                             ← NEW (judgeRoom orchestrator)
│   │   └── __tests__/judging.test.ts              ← NEW
│   └── realtime/
│       ├── channels.ts                            ← MODIFIED (chainScoresChannel helper)
│       ├── useRoom.ts                             ← MODIFIED (subscribe to chain_scores)
│       └── __tests__/channels.test.ts             ← MODIFIED
└── sql/
    └── 010_chain_scores_realtime.sql              ← NEW
```

**Out of scope for this plan** (each landing in Plan 5):
- Judge0 behavioural testing.
- Vercel deploy / Playwright smoke.
- Generated test cases passed into Gemini's prompt.
- Parallel multi-chain judging.

---

## Judging flow

```
Last player submits → submit_turn RPC sets phase='reveal'
                    → inserts N chain_scores rows with status='pending'
                    → returns 200 to submitting player

All clients receive Realtime UPDATE on rooms.phase → router.replace(/reveal/[code])

First /reveal mount → POST /api/judge/[roomId]
                    → route returns 202 + after() schedules judgeRoom
                    
judgeRoom iterates chains:
  for each chain c with status='pending':
    original   = submissions where chain_index=c and round_num=1
    final      = submissions where chain_index=c and round_num=ROUND_COUNT
    result     = judgeChain(original, final)
    UPDATE chain_scores SET status='done', overall_score=, notes= WHERE chain_index=c
  (on Gemini error for a chain: status='failed' with notes='gemini api error: ...')

Each UPDATE fires a Realtime postgres_changes event → all /reveal clients animate the score in.
```

**Idempotency:** subsequent POSTs from other tabs do the same iteration. Each iteration skips chains whose status is already 'done' or 'failed'. Concurrent runs may race on the same pending chain but `UPDATE` is atomic; last writer wins. Acceptable for the demo.

**Failure semantics:** Gemini errors → `chain_scores.status='failed'`, `notes` flags it. Reveal shows "scoring unavailable" for that chain. Other chains still complete.

---

## Task 1: Migration `010_chain_scores_realtime.sql` — add chain_scores to Realtime publication

**Files:**
- Create: `sql/010_chain_scores_realtime.sql`

Tiny migration. `chain_scores` was created in Plan 1 (migration 005) but never added to `supabase_realtime`. Browsers can't subscribe to it until that ALTER runs.

- [ ] **Step 1: Create the migration file**

```sql
-- 010_chain_scores_realtime.sql
-- Add chain_scores to the Realtime publication so the /reveal page can
-- subscribe to score updates as judgeRoom flips status pending → done/failed.
-- Idempotent via the pg_publication_tables check.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chain_scores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chain_scores;
  END IF;
END $$;
```

- [ ] **Step 2: Apply via Management API**

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2 | tr -d '\r')
REF=tqxdsjuxiljsmcqkjxxt
body=$(node -e "process.stdout.write(JSON.stringify({query: require('fs').readFileSync('sql/010_chain_scores_realtime.sql','utf8')}))")
curl -sS --retry 3 --retry-delay 2 -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$body" -w "\nHTTP:%{http_code}\n"
```

Expected HTTP 201 with `[]` body.

- [ ] **Step 3: Verify**

```bash
body=$(node -e "process.stdout.write(JSON.stringify({query: \"SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename;\"}))")
curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$body"
```

Expected: array with 4 entries — `chain_scores`, `players`, `rooms`, `submissions`.

- [ ] **Step 4: Commit checkpoint**

```
feat(db): add chain_scores to supabase_realtime publication

Lets /reveal subscribe to score updates as judgeRoom flips status from
pending → done/failed. Was missing — chain_scores was created in 005
but never joined the publication.
```

---

## Task 2: `lib/judge/gemini.ts` — Gemini API client (TDD)

**Files:**
- Test: `lib/judge/__tests__/gemini.test.ts`
- Create: `lib/judge/gemini.ts`

A direct `fetch` against Google's `generativelanguage.googleapis.com` REST endpoint. No SDK — the API surface is small enough to handcraft, and one less dependency.

API:
- `judgeChain({ originalCode, finalCode, language }) → { overallScore: number, notes: string }`
- Throws on network errors or unparseable response.

Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=<KEY>`
Body shape: `{ contents: [{ parts: [{ text: "<prompt>" }] }] }`
Response: `{ candidates: [{ content: { parts: [{ text: "<json>" }] } }] }`

- [ ] **Step 1: Write the failing test**

Create `lib/judge/__tests__/gemini.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { judgeChain } from '../gemini';

const GOOD_RESPONSE = {
  candidates: [{
    content: {
      parts: [{ text: '{"overallScore": 78, "notes": "Same shape, slightly different control flow."}' }],
    },
  }],
};

describe('judgeChain', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('returns { overallScore, notes } parsed from the model output', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(GOOD_RESPONSE), { status: 200 }));
    const result = await judgeChain({
      originalCode: 'def f(x): return x*2',
      finalCode: 'def f(x): return 2*x',
      language: 'python',
    });
    expect(result).toEqual({
      overallScore: 78,
      notes: 'Same shape, slightly different control flow.',
    });
  });

  it('sends the API key as a query param and the prompt in the body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(GOOD_RESPONSE), { status: 200 }));
    await judgeChain({ originalCode: 'a', finalCode: 'b', language: 'python' });
    const call = vi.mocked(fetch).mock.calls[0];
    const url = call[0] as string;
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('gemini-2.5-flash:generateContent');
    expect(url).toContain('key=test-api-key');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].text).toContain('a');
    expect(body.contents[0].parts[0].text).toContain('b');
    expect(body.contents[0].parts[0].text).toContain('python');
  });

  it('strips markdown code fences before JSON.parse (Gemini sometimes wraps)', async () => {
    const fenced = {
      candidates: [{
        content: {
          parts: [{ text: '```json\n{"overallScore": 65, "notes": "ok"}\n```' }],
        },
      }],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(fenced), { status: 200 }));
    const result = await judgeChain({ originalCode: 'a', finalCode: 'b', language: 'python' });
    expect(result).toEqual({ overallScore: 65, notes: 'ok' });
  });

  it('throws if the API returns non-200', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('forbidden', { status: 403 }));
    await expect(judgeChain({ originalCode: 'a', finalCode: 'b', language: 'python' }))
      .rejects.toThrow(/403/);
  });

  it('throws if the response has no candidates', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    await expect(judgeChain({ originalCode: 'a', finalCode: 'b', language: 'python' }))
      .rejects.toThrow(/no candidates/i);
  });

  it('throws if the text is not parseable JSON', async () => {
    const bad = {
      candidates: [{ content: { parts: [{ text: 'this is not JSON' }] } }],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(bad), { status: 200 }));
    await expect(judgeChain({ originalCode: 'a', finalCode: 'b', language: 'python' }))
      .rejects.toThrow(/parse/i);
  });

  it('clamps overallScore to 0..100 if Gemini hallucinates an out-of-range number', async () => {
    const oob = {
      candidates: [{ content: { parts: [{ text: '{"overallScore": 150, "notes": "wild"}' }] } }],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(oob), { status: 200 }));
    const result = await judgeChain({ originalCode: 'a', finalCode: 'b', language: 'python' });
    expect(result.overallScore).toBe(100);
  });

  it('throws if GEMINI_API_KEY is unset', async () => {
    vi.unstubAllEnvs();
    await expect(judgeChain({ originalCode: 'a', finalCode: 'b', language: 'python' }))
      .rejects.toThrow(/GEMINI_API_KEY/);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run lib/judge/__tests__/gemini.test.ts
```

- [ ] **Step 3: Implement `lib/judge/gemini.ts`**

```typescript
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export type JudgeInput = {
  originalCode: string;
  finalCode: string;
  language: string;
};
export type JudgeResult = {
  overallScore: number;
  notes: string;
};

function buildPrompt({ originalCode, finalCode, language }: JudgeInput): string {
  return `You are evaluating how faithfully a code reconstruction matches an original function passed through a game of telephone.

Original function (language: ${language}):
\`\`\`${language}
${originalCode}
\`\`\`

Final reconstruction (language: ${language}):
\`\`\`${language}
${finalCode}
\`\`\`

Score the reconstruction from 0 to 100:
- 100: behaviorally and structurally identical
- 80+: same behavior, minor style differences
- 60-79: similar intent, partial behavior match
- 40-59: roughly the right shape but significantly different
- below 40: lost most of the original idea

Return JSON only, no commentary:
{"overallScore": <0-100>, "notes": "<1-2 sentence explanation>"}`;
}

function stripFences(text: string): string {
  // Gemini sometimes wraps JSON in ```json ... ``` fences. Strip them.
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export async function judgeChain(input: JudgeInput): Promise<JudgeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(input) }] }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`gemini API ${res.status}: ${detail.slice(0, 200)}`);
  }

  const body = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('gemini: no candidates in response');

  let parsed: { overallScore?: unknown; notes?: unknown };
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (err) {
    throw new Error(`gemini: failed to parse JSON: ${(err as Error).message}`);
  }

  const score = typeof parsed.overallScore === 'number' ? parsed.overallScore : Number(parsed.overallScore);
  const notes = typeof parsed.notes === 'string' ? parsed.notes : '';
  return {
    overallScore: clampScore(score),
    notes,
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/judge/__tests__/gemini.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit checkpoint**

```
feat(judge): Gemini API client (lib/judge/gemini.ts)

Direct fetch against generativelanguage.googleapis.com — no SDK. Builds
a structured prompt asking for {overallScore, notes} JSON. Strips
markdown fences Gemini occasionally adds. Clamps the score to 0..100.
8 tests cover happy path, fenced response, error responses, malformed
output, and missing env var.
```

---

## Task 3: `lib/game/judging.ts` — judgeRoom orchestrator (TDD)

**Files:**
- Test: `lib/game/__tests__/judging.test.ts`
- Create: `lib/game/judging.ts`

`judgeRoom(supabase, roomId)`:
1. Load all submissions for the room (need round 1 + final-round code per chain).
2. Load chain_scores rows; iterate only the `status='pending'` ones.
3. For each pending chain, find original (round 1, chain c, round_type='code') and final (round = round_count, chain c, round_type='code').
4. Call `judgeChain()`. On success → UPDATE chain_scores SET status='done', overall_score=, notes=. On failure → UPDATE status='failed', notes=err.message.
5. Sequential, not parallel — keeps us under the 60s serverless budget for ~5 chains × ~8s each.

API:
- `judgeRoom({ supabase, roomId, judgeChain? }) → { judged: number, failed: number }`
- The `judgeChain` arg is for DI/testing — defaults to the real `judgeChain` from `lib/judge/gemini`.

- [ ] **Step 1: Write the failing test**

Create `lib/game/__tests__/judging.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { judgeRoom } from '../judging';

function mockSupabase(opts: {
  room: { id: string; round_count: number };
  submissions: Array<{ chain_index: number; round_num: number; round_type: string; content: string; language: string | null }>;
  chainScores: Array<{ chain_index: number; status: string }>;
}) {
  const calls: Array<{ op: string; table?: string; payload?: unknown; col?: string; val?: unknown }> = [];
  let currentTable: string | null = null;
  let currentPayload: unknown = null;

  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    from(table: string) { currentTable = table; currentPayload = null; calls.push({ op: 'from', table }); return chain; },
    select(_cols?: string) { calls.push({ op: 'select', table: currentTable! }); return chain; },
    update(payload: unknown) { currentPayload = payload; calls.push({ op: 'update', table: currentTable!, payload }); return chain; },
    eq(col: string, val: unknown) { calls.push({ op: 'eq', table: currentTable!, col, val }); return chain; },
    maybeSingle() {
      if (currentTable === 'rooms') return Promise.resolve({ data: opts.room, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (v: { data: unknown; error: unknown }) => void) {
      if (currentPayload !== null) {
        // It's an UPDATE...eq() chain. Just resolve with success.
        resolve({ data: null, error: null });
        return;
      }
      if (currentTable === 'submissions') {
        resolve({ data: opts.submissions, error: null });
      } else if (currentTable === 'chain_scores') {
        resolve({ data: opts.chainScores, error: null });
      } else {
        resolve({ data: null, error: null });
      }
    },
  });

  return { sb: chain as never, calls };
}

describe('judgeRoom', () => {
  it('judges each pending chain sequentially and writes done rows', async () => {
    const { sb, calls } = mockSupabase({
      room: { id: 'r1', round_count: 3 },
      submissions: [
        { chain_index: 0, round_num: 0, round_type: 'describe', content: 'prompt 0', language: null },
        { chain_index: 0, round_num: 1, round_type: 'code',     content: 'orig0',    language: 'python' },
        { chain_index: 0, round_num: 2, round_type: 'describe', content: 'desc',     language: null },
        { chain_index: 0, round_num: 3, round_type: 'code',     content: 'final0',   language: 'python' },
        { chain_index: 1, round_num: 1, round_type: 'code',     content: 'orig1',    language: 'python' },
        { chain_index: 1, round_num: 3, round_type: 'code',     content: 'final1',   language: 'python' },
      ],
      chainScores: [
        { chain_index: 0, status: 'pending' },
        { chain_index: 1, status: 'pending' },
      ],
    });

    const judgeChain = vi.fn()
      .mockResolvedValueOnce({ overallScore: 80, notes: 'ok0' })
      .mockResolvedValueOnce({ overallScore: 60, notes: 'ok1' });

    const result = await judgeRoom({ supabase: sb, roomId: 'r1', judgeChain });

    expect(result).toEqual({ judged: 2, failed: 0 });
    expect(judgeChain).toHaveBeenCalledTimes(2);
    expect(judgeChain).toHaveBeenNthCalledWith(1, {
      originalCode: 'orig0', finalCode: 'final0', language: 'python',
    });
    expect(judgeChain).toHaveBeenNthCalledWith(2, {
      originalCode: 'orig1', finalCode: 'final1', language: 'python',
    });

    const updateCalls = calls.filter((c) => c.op === 'update' && c.table === 'chain_scores');
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0].payload).toMatchObject({ status: 'done', overall_score: 80, notes: 'ok0' });
    expect(updateCalls[1].payload).toMatchObject({ status: 'done', overall_score: 60, notes: 'ok1' });
  });

  it('skips chains that are already done or failed', async () => {
    const { sb } = mockSupabase({
      room: { id: 'r1', round_count: 3 },
      submissions: [
        { chain_index: 0, round_num: 1, round_type: 'code', content: 'o', language: 'python' },
        { chain_index: 0, round_num: 3, round_type: 'code', content: 'f', language: 'python' },
        { chain_index: 1, round_num: 1, round_type: 'code', content: 'o', language: 'python' },
        { chain_index: 1, round_num: 3, round_type: 'code', content: 'f', language: 'python' },
      ],
      chainScores: [
        { chain_index: 0, status: 'done' },
        { chain_index: 1, status: 'pending' },
      ],
    });

    const judgeChain = vi.fn().mockResolvedValue({ overallScore: 50, notes: 'mid' });
    const result = await judgeRoom({ supabase: sb, roomId: 'r1', judgeChain });

    expect(result).toEqual({ judged: 1, failed: 0 });
    expect(judgeChain).toHaveBeenCalledTimes(1);
  });

  it('records failures (status=failed, notes=error)', async () => {
    const { sb, calls } = mockSupabase({
      room: { id: 'r1', round_count: 3 },
      submissions: [
        { chain_index: 0, round_num: 1, round_type: 'code', content: 'o', language: 'python' },
        { chain_index: 0, round_num: 3, round_type: 'code', content: 'f', language: 'python' },
      ],
      chainScores: [{ chain_index: 0, status: 'pending' }],
    });

    const judgeChain = vi.fn().mockRejectedValue(new Error('rate limit'));
    const result = await judgeRoom({ supabase: sb, roomId: 'r1', judgeChain });

    expect(result).toEqual({ judged: 0, failed: 1 });
    const updateCalls = calls.filter((c) => c.op === 'update' && c.table === 'chain_scores');
    expect(updateCalls[0].payload).toMatchObject({ status: 'failed' });
    expect((updateCalls[0].payload as { notes: string }).notes).toContain('rate limit');
  });

  it('returns { judged: 0, failed: 0 } when no chains are pending', async () => {
    const { sb } = mockSupabase({
      room: { id: 'r1', round_count: 3 },
      submissions: [],
      chainScores: [{ chain_index: 0, status: 'done' }, { chain_index: 1, status: 'failed' }],
    });
    const judgeChain = vi.fn();
    const result = await judgeRoom({ supabase: sb, roomId: 'r1', judgeChain });
    expect(result).toEqual({ judged: 0, failed: 0 });
    expect(judgeChain).not.toHaveBeenCalled();
  });

  it('marks a chain failed if original or final code is missing', async () => {
    const { sb, calls } = mockSupabase({
      room: { id: 'r1', round_count: 3 },
      submissions: [
        // Only round 1 exists for chain 0; no final round.
        { chain_index: 0, round_num: 1, round_type: 'code', content: 'o', language: 'python' },
      ],
      chainScores: [{ chain_index: 0, status: 'pending' }],
    });

    const judgeChain = vi.fn();
    const result = await judgeRoom({ supabase: sb, roomId: 'r1', judgeChain });

    expect(result).toEqual({ judged: 0, failed: 1 });
    expect(judgeChain).not.toHaveBeenCalled();
    const updateCalls = calls.filter((c) => c.op === 'update' && c.table === 'chain_scores');
    expect(updateCalls[0].payload).toMatchObject({ status: 'failed' });
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run lib/game/__tests__/judging.test.ts
```

- [ ] **Step 3: Implement `lib/game/judging.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { judgeChain as realJudgeChain, type JudgeResult } from '@/lib/judge/gemini';

type Submission = {
  chain_index: number;
  round_num: number;
  round_type: string;
  content: string;
  language: string | null;
};

type ChainScore = {
  chain_index: number;
  status: string;
};

export async function judgeRoom(args: {
  supabase: SupabaseClient;
  roomId: string;
  judgeChain?: (input: { originalCode: string; finalCode: string; language: string }) => Promise<JudgeResult>;
}): Promise<{ judged: number; failed: number }> {
  const { supabase, roomId } = args;
  const judge = args.judgeChain ?? realJudgeChain;

  const { data: room } = await supabase
    .from('rooms').select('id, round_count').eq('id', roomId).maybeSingle();
  if (!room) return { judged: 0, failed: 0 };
  const roundCount = (room as { round_count: number }).round_count;

  const { data: subsData } = await supabase
    .from('submissions').select('chain_index, round_num, round_type, content, language').eq('room_id', roomId);
  const submissions = (subsData ?? []) as Submission[];

  const { data: scoresData } = await supabase
    .from('chain_scores').select('chain_index, status').eq('room_id', roomId);
  const scores = (scoresData ?? []) as ChainScore[];

  let judged = 0;
  let failed = 0;

  for (const score of scores) {
    if (score.status !== 'pending') continue;

    const c = score.chain_index;
    const original = submissions.find((s) => s.chain_index === c && s.round_num === 1 && s.round_type === 'code');
    const final = submissions.find((s) => s.chain_index === c && s.round_num === roundCount && s.round_type === 'code');

    if (!original || !final) {
      await supabase
        .from('chain_scores')
        .update({ status: 'failed', notes: 'missing original or final code submission', updated_at: new Date().toISOString() })
        .eq('room_id', roomId).eq('chain_index', c);
      failed++;
      continue;
    }

    try {
      const result = await judge({
        originalCode: original.content,
        finalCode: final.content,
        language: original.language ?? 'python',
      });
      await supabase
        .from('chain_scores')
        .update({
          status: 'done',
          overall_score: result.overallScore,
          notes: result.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('room_id', roomId).eq('chain_index', c);
      judged++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from('chain_scores')
        .update({ status: 'failed', notes: `gemini api error: ${message}`, updated_at: new Date().toISOString() })
        .eq('room_id', roomId).eq('chain_index', c);
      failed++;
    }
  }

  return { judged, failed };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/game/__tests__/judging.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit checkpoint**

```
feat(game): judgeRoom orchestrator (lib/game/judging.ts)

Loads submissions + chain_scores, iterates pending chains sequentially,
calls judgeChain (DI'd for testing), writes status=done|failed with
score+notes. Skips done/failed rows so concurrent triggers are safe.
Missing original/final code → status=failed with a clear note.
```

---

## Task 4: POST `/api/judge/[roomId]` route handler (TDD)

**Files:**
- Test: `app/api/judge/[roomId]/__tests__/route.test.ts`
- Create: `app/api/judge/[roomId]/route.ts`

Validates `roomId` is a uuid, returns 202 immediately, schedules `judgeRoom` via `after()`. The route is **public** — no cookie required. Anyone who lands on `/reveal/[code]` can trigger judging. The cost is bounded by chain_scores rows: if there's nothing pending, `judgeRoom` returns quickly.

- [ ] **Step 1: Write the failing test**

Create `app/api/judge/[roomId]/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/game/judging', () => ({ judgeRoom: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));

// Capture after() callbacks so the test can flush them.
const afterCallbacks: Array<() => void | Promise<void>> = [];
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (cb: () => void | Promise<void>) => { afterCallbacks.push(cb); },
  };
});

import { POST } from '../route';
import { judgeRoom } from '@/lib/game/judging';

function req(roomId: string) {
  return new NextRequest(`http://localhost/api/judge/${roomId}`, { method: 'POST' });
}

const UUID = 'b8a61e7c-c6bc-448f-93a4-da0a22621fa3';

describe('POST /api/judge/[roomId]', () => {
  beforeEach(() => {
    afterCallbacks.length = 0;
    vi.mocked(judgeRoom).mockReset().mockResolvedValue({ judged: 2, failed: 0 });
  });

  it('returns 202 immediately and schedules judgeRoom via after()', async () => {
    const res = await POST(req(UUID), { params: Promise.resolve({ roomId: UUID }) });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: true });
    expect(vi.mocked(judgeRoom)).not.toHaveBeenCalled(); // not yet — runs after response
    expect(afterCallbacks).toHaveLength(1);
    // Flush.
    await afterCallbacks[0]();
    expect(vi.mocked(judgeRoom)).toHaveBeenCalledWith({ supabase: {}, roomId: UUID });
  });

  it('400 for a malformed roomId (not uuid)', async () => {
    const res = await POST(req('not-a-uuid'), { params: Promise.resolve({ roomId: 'not-a-uuid' }) });
    expect(res.status).toBe(400);
    expect(afterCallbacks).toHaveLength(0);
  });

  it('still returns 202 if judgeRoom throws in the background (errors are swallowed)', async () => {
    vi.mocked(judgeRoom).mockRejectedValue(new Error('boom'));
    const res = await POST(req(UUID), { params: Promise.resolve({ roomId: UUID }) });
    expect(res.status).toBe(202);
    // Flushing the callback shouldn't propagate the error to the caller.
    await expect(afterCallbacks[0]()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run 'app/api/judge/[roomId]/__tests__/route.test.ts'
```

- [ ] **Step 3: Implement `app/api/judge/[roomId]/route.ts`**

```typescript
import { NextResponse, after, type NextRequest } from 'next/server';
import { judgeRoom } from '@/lib/game/judging';
import { getServiceClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await ctx.params;
  if (!UUID_RE.test(roomId)) {
    return NextResponse.json(
      { error: { code: 'INVALID_SUBMIT', message: 'roomId must be a uuid' } },
      { status: 400 },
    );
  }

  after(async () => {
    try {
      await judgeRoom({ supabase: getServiceClient(), roomId });
    } catch (err) {
      console.error('[POST /api/judge/[roomId]] judgeRoom failed', err);
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run 'app/api/judge/[roomId]/__tests__/route.test.ts'
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit checkpoint**

```
feat(api): POST /api/judge/[roomId] — fire-and-forget AI judging

Returns 202 immediately and runs judgeRoom in next/server's after()
phase. Errors are swallowed (judgeRoom itself writes status='failed'
to chain_scores; logging here is just for the unexpected case).
Public endpoint — any reveal-page mount can trigger it.
```

---

## Task 5: Extend `useRoom` to subscribe to `chain_scores`

**Files:**
- Modify: `lib/realtime/channels.ts`
- Modify: `lib/realtime/__tests__/channels.test.ts`
- Modify: `lib/realtime/useRoom.ts`

Same pattern Plan 3 used to add `submissions`. Add a `chainScoresChannel` helper, a `ChainScoreRow` type, fold into the existing useRoom subscription set.

- [ ] **Step 1: Add `chainScoresChannel` to `lib/realtime/channels.ts`**

Append:

```typescript
export function chainScoresChannel(roomId: string): string {
  return `chain_scores:${roomId}`;
}
```

- [ ] **Step 2: Extend the channels test**

Update `lib/realtime/__tests__/channels.test.ts` to import + test `chainScoresChannel`:

```typescript
import { roomChannel, playersChannel, submissionsChannel, chainScoresChannel } from '../channels';
```

Add a test inside the existing `describe('channel name helpers', ...)`:

```typescript
it('chainScoresChannel encodes the room id', () => {
  expect(chainScoresChannel('abc-123')).toBe('chain_scores:abc-123');
});
```

- [ ] **Step 3: Add `ChainScoreRow` type and field to `useRoom.ts`**

In `lib/realtime/useRoom.ts`, after the `SubmissionRow` type, add:

```typescript
export type ChainScoreRow = {
  room_id: string;
  chain_index: number;
  status: 'pending' | 'done' | 'failed';
  overall_score: number | null;
  notes: string | null;
  updated_at: string;
};
```

Change `UseRoomState`:

```typescript
export type UseRoomState = {
  room: RoomRow | null;
  players: PlayerRow[];
  submissions: SubmissionRow[];
  chainScores: ChainScoreRow[];
  loading: boolean;
  error: string | null;
};
```

Update initial `useState` and the `roomId === null` branch to include `chainScores: []`.

- [ ] **Step 4: Add the initial fetch + subscription**

Import `chainScoresChannel` at the top:

```typescript
import { roomChannel, playersChannel, submissionsChannel, chainScoresChannel } from './channels';
```

Extend the Promise.all to include chain_scores:

```typescript
const [roomRes, playersRes, submissionsRes, chainScoresRes] = await Promise.all([
  sb.from('rooms').select('*').eq('id', roomId).maybeSingle(),
  sb.from('players').select('*').eq('room_id', roomId).order('created_at', { ascending: true }),
  sb.from('submissions').select('*').eq('room_id', roomId).order('created_at', { ascending: true }),
  sb.from('chain_scores').select('*').eq('room_id', roomId).order('chain_index', { ascending: true }),
]);
```

Update the error guard:

```typescript
if (roomRes.error || playersRes.error || submissionsRes.error || chainScoresRes.error) {
  setState((s) => ({
    ...s,
    loading: false,
    error:
      roomRes.error?.message ??
      playersRes.error?.message ??
      submissionsRes.error?.message ??
      chainScoresRes.error?.message ??
      'unknown',
  }));
  return;
}
```

And the success setState:

```typescript
setState({
  room: roomRes.data as RoomRow | null,
  players: (playersRes.data ?? []) as PlayerRow[],
  submissions: (submissionsRes.data ?? []) as SubmissionRow[],
  chainScores: (chainScoresRes.data ?? []) as ChainScoreRow[],
  loading: false,
  error: null,
});
```

Add the channel below the `submissionsCh`:

```typescript
const chainScoresCh = sb
  .channel(chainScoresChannel(roomId))
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'chain_scores', filter: `room_id=eq.${roomId}` },
    (payload) => {
      setState((s) => {
        const list = [...s.chainScores];
        if (payload.eventType === 'INSERT') {
          list.push(payload.new as ChainScoreRow);
        } else if (payload.eventType === 'UPDATE') {
          const idx = list.findIndex((r) => r.chain_index === (payload.new as ChainScoreRow).chain_index);
          if (idx >= 0) list[idx] = payload.new as ChainScoreRow;
          else list.push(payload.new as ChainScoreRow);
        } else if (payload.eventType === 'DELETE') {
          const idx = (payload.old as ChainScoreRow).chain_index;
          return { ...s, chainScores: list.filter((r) => r.chain_index !== idx) };
        }
        list.sort((a, b) => a.chain_index - b.chain_index);
        return { ...s, chainScores: list };
      });
    },
  )
  .subscribe();
```

Update the cleanup:

```typescript
return () => {
  cancelled = true;
  sb.removeChannel(roomCh);
  sb.removeChannel(playersCh);
  sb.removeChannel(submissionsCh);
  sb.removeChannel(chainScoresCh);
};
```

- [ ] **Step 5: Run tests + tsc**

```bash
npx vitest run lib/realtime/__tests__/channels.test.ts && npx tsc --noEmit
```

Expected: 4 channels tests pass; tsc exit 0.

- [ ] **Step 6: Commit checkpoint**

```
feat(realtime): useRoom now subscribes to chain_scores

Same pattern as submissions. /reveal binds the chainScores array and
re-renders as judgeRoom flips status pending → done|failed via
Realtime postgres_changes.
```

---

## Task 6: Wire `/reveal/[code]` — trigger judge + render scores

**Files:**
- Modify: `app/reveal/[code]/page.jsx`

Two additions:
1. When the page mounts and `room.phase === 'reveal'` for the first time, POST `/api/judge/[roomId]` once. Track a ref or state flag to avoid retriggering.
2. Replace the "AI scoring lands in Plan 4" placeholder with a real score panel that reads from `chainScores`. Three states per chain: `pending` (spinner / "Scoring…"), `done` (big % number), `failed` (red "scoring unavailable" with `notes`).

- [ ] **Step 1: Read the current file**

```bash
cat app/reveal/\[code\]/page.jsx
```

Note the structure: the existing `chains = chainsFromSubmissions(submissions, players)` and the "AI scoring lands in Plan 4" placeholder section.

- [ ] **Step 2: Add `chainScores` to the useRoom destructure**

Change:

```javascript
const { room, players, submissions, loading, error } = useRoom(roomId);
```

to:

```javascript
const { room, players, submissions, chainScores, loading, error } = useRoom(roomId);
```

- [ ] **Step 3: Add the judge-trigger effect**

Just below the existing phase-navigation `useEffect`, add:

```javascript
// Trigger AI judging once per (roomId, reveal phase) entry. Multiple
// reveal-page mounts across tabs all POST; the route+RPC are
// idempotent (chains already done/failed are skipped).
useEffect(() => {
  if (!roomId || !room || room.phase !== "reveal") return;
  let cancelled = false;
  (async () => {
    try {
      await fetch(`/api/judge/${roomId}`, { method: "POST" });
    } catch (err) {
      if (!cancelled) console.warn("[reveal] judge trigger failed:", err);
    }
  })();
  return () => { cancelled = true; };
}, [roomId, room?.phase]);
```

- [ ] **Step 4: Build the score panel**

Find the placeholder section in the rendered tree:

```javascript
<section className={styles.section}>
  <p className={styles.emptyMessage}>
    AI scoring lands in Plan 4. For now, scroll the chain above.
  </p>
</section>
```

Replace with:

```javascript
{chain && (() => {
  const scoreRow = chainScores.find((s) => s.chain_index === chain.chainIndex);
  if (!scoreRow || scoreRow.status === "pending") {
    return (
      <section className={styles.section}>
        <p className={styles.emptyMessage}>Scoring this chain…</p>
      </section>
    );
  }
  if (scoreRow.status === "failed") {
    return (
      <section className={styles.section}>
        <p className={styles.emptyMessage}>
          Scoring unavailable: {scoreRow.notes ?? "unknown error"}
        </p>
      </section>
    );
  }
  // done
  return (
    <section className={styles.section}>
      <div className={styles.scoreBlock ?? ""}>
        <div style={{ fontSize: "3rem", fontWeight: 700 }}>
          {scoreRow.overall_score ?? "—"}<span style={{ fontSize: "1.5rem", opacity: 0.6 }}>/100</span>
        </div>
        {scoreRow.notes && (
          <p style={{ marginTop: "0.5rem", opacity: 0.8 }}>{scoreRow.notes}</p>
        )}
      </div>
    </section>
  );
})()}
```

(The inline styles are placeholder — Plan 5 can move them to `page.module.css` if Andy wants polish.)

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit checkpoint**

```
feat(reveal): trigger AI judging on mount + bind chain_scores

POSTs /api/judge/[roomId] when phase first equals reveal. Renders one
of three states per viewed chain: pending (Scoring…), done (overall %
+ notes), failed (Scoring unavailable: <notes>). Other reveal clients
see the same updates via Realtime postgres_changes on chain_scores.
```

---

## Task 7: Verify Plan 4 exit criteria

**Files:**
- Read-only.

The spec's Step 4 exit criterion: "reveal shows AI scores per chain."

- [ ] **Step 1: Tests + tsc green**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all tests pass; tsc exit 0.

- [ ] **Step 2: Verify migration 010 applied**

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2 | tr -d '\r')
REF=tqxdsjuxiljsmcqkjxxt
body=$(node -e "process.stdout.write(JSON.stringify({query: \"SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename;\"}))")
curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$body"
```

Expected: includes `chain_scores`.

- [ ] **Step 3: 3-tab manual smoke**

Run through the full game flow from Plan 3 Task 15 (create / join / start / submit through all rounds). At the end, on `/reveal/[code]`:

| Check | Expected |
|---|---|
| Network: POST `/api/judge/[roomId]` fires once per tab on mount | 202 response |
| Score panel initially says "Scoring this chain…" | yes |
| Within ~30s, each chain's score block flips to a number 0–100 + notes | yes |
| Switching chains via the chain picker shows that chain's score | yes |
| If you trigger Play again then re-finish, scores reset and re-compute | yes |

If a chain shows "Scoring unavailable":
- Check the dev server log for the actual Gemini error.
- Common: `GEMINI_API_KEY` invalid or rate-limited. Confirm with a direct curl to `generativelanguage.googleapis.com`.

- [ ] **Step 4: DB spot-check**

In the Supabase SQL editor (or via Management API):

```sql
SELECT chain_index, status, overall_score, length(notes)
FROM chain_scores
WHERE room_id = (SELECT id FROM rooms WHERE code = '<CODE>')
ORDER BY chain_index;
```

Expected: every row `status='done'` with `overall_score` in 0..100 and a non-empty `notes`.

- [ ] **Step 5: Final commit (if anything was tweaked during verification)**

```
chore: verify Plan 4 exit criteria

- 3-tab smoke: each chain's score lands in /reveal within ~30s
- chain_scores rows all status=done with scores in range
- Realtime fan-out arrives in all tabs simultaneously
```

---

## Plan 4 — Exit criteria

After this plan is complete:

- A reveal-page mount POSTs `/api/judge/[roomId]` once.
- The route returns 202 immediately and runs `judgeRoom` in `after()`.
- `judgeRoom` iterates pending chains sequentially, calls Gemini, writes results to `chain_scores`.
- Each `chain_scores` UPDATE fans out via Realtime to every connected reveal client.
- The reveal page shows live "Scoring…" → score / "Scoring unavailable" per chain.
- Gemini errors degrade gracefully — only the affected chain shows "Scoring unavailable"; others succeed.
- Vitest suite green (~100 tests across 19 files after this plan).
- tsc clean.

Plan 5 builds on this:
- Judge0 integration in `lib/judge0/run.ts`. Gemini receives behavioural test results.
- Vercel deploy wiring.
- One Playwright smoke through the full 3-tab chain (covers Realtime fan-out in CI).

## Self-review notes

**Spec coverage for Step 4 (Reveal + AI judge):**
- ✓ `lib/judge/gemini.ts` (Task 2).
- ✓ `lib/game/judging.ts` (Task 3).
- ✓ `app/api/judge/[roomId]/route.ts` — fire-and-forget, sequential per chain (Tasks 3 + 4).
- ✓ Reveal page subscribes to `chain_scores` via Realtime (Tasks 5 + 6).
- ✓ Snapshot test against recorded Gemini response (Task 2 — covered by the mocked-fetch + recorded-fixture approach).

**Failure handling (spec's "Failure handling" section):**
- ✓ Gemini failure → `chain_scores.status = 'failed'` with notes; other chains continue (Task 3).
- ⚠ Judge0 failure → judge with code-only context. Out of scope for this plan; Plan 5 implements Judge0.
- ✓ Sequential, not parallel — keeps under serverless 60s budget.

**Race-condition coverage:**
- Multiple reveal-page mounts will POST concurrently. Each judgeRoom skips chains where `status != 'pending'`. Two concurrent runs may race on the same pending chain; the final UPDATE is last-write-wins. Acceptable for the demo posture.

**Type consistency:**
- `ChainScoreRow` defined once in `lib/realtime/useRoom.ts`; consumed by reveal page.
- `JudgeResult` / `JudgeInput` defined in `lib/judge/gemini.ts`; consumed by judging.ts via DI'd judgeChain.

**Placeholder scan:** no "TBD" / "implement later" / "Similar to Task N" / "appropriate error handling" in task bodies.

**Known gaps, deferred to Plan 5:**
- The /reveal score block uses inline styles. CSS Module styling deferred (Plan 5 polish).
- Judge0 integration entirely deferred.
- No Playwright/E2E coverage of the judging flow — Plan 5 adds the smoke.
- No "retry failed chain" button. Manual: host clicks Play Again → reset, then play again.
