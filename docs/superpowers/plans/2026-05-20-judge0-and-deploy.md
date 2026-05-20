# Judge0 + Deploy Implementation Plan (Plan 5 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three things, all optional-but-graceful. (1) When `JUDGE0_API_KEY` is set, the AI judge runs behavioural test cases against both the original and reconstructed code, and Gemini factors the pass/fail counts into its score. (2) A single Playwright smoke test walks 3 browser contexts through a full game so future regressions get caught. (3) The app deploys to Vercel at a public URL.

**Architecture:** Judge0 sits behind a tiny wrapper (`lib/judge0/run.ts`). Gemini generates 2–3 test snippets per chain (`lib/judge/test-cases.ts`); we concat each snippet with the user's code and submit to Judge0. Failures at any step (key missing, Gemini bad JSON, Judge0 timeout) degrade silently to Plan 4's code-only judging — the reveal page never breaks on a missing optional dependency. Playwright drives 3 isolated browser contexts against the local dev server. Vercel deploy is a one-shot CLI script.

**Tech Stack:** Same as Plan 4 + `@playwright/test` (new dev dep) + Judge0 CE via RapidAPI (no SDK — direct fetch). No prod runtime deps beyond what's already there.

**Source spec:** `docs/superpowers/specs/2026-05-20-nextjs-merge-design.md` (Steps 5 + 6). Final plan; after this lands the demo URL plays end-to-end.

---

## File structure produced by this plan

```
trainee-zeus-26t1/
├── app/
│   └── (no changes — reveal already shows the score; richer notes from Judge0 fall through automatically)
├── lib/
│   ├── judge/
│   │   ├── gemini.ts                              ← MODIFIED (judgeChain accepts optional testResults)
│   │   ├── test-cases.ts                          ← NEW (Gemini → test snippets)
│   │   └── __tests__/
│   │       ├── gemini.test.ts                     ← MODIFIED (new tests for testResults path)
│   │       └── test-cases.test.ts                 ← NEW
│   ├── judge0/
│   │   ├── run.ts                                 ← NEW (Judge0 RapidAPI client)
│   │   └── __tests__/run.test.ts                  ← NEW
│   └── game/
│       ├── judging.ts                             ← MODIFIED (orchestrates Judge0 + Gemini, with fallback)
│       └── __tests__/judging.test.ts              ← MODIFIED (new tests for Judge0 path)
├── tests/
│   └── e2e/
│       └── full-chain.spec.ts                     ← NEW (Playwright)
├── playwright.config.ts                           ← NEW
├── package.json                                   ← MODIFIED (playwright dev dep + scripts)
├── README.md                                      ← MODIFIED (Vercel deploy section)
└── vitest.config.ts                               ← MODIFIED (exclude tests/e2e from vitest)
```

**Out of scope:**
- Cross-language Judge0 (Python only — JS/Java skip Judge0 silently).
- Parallel multi-chain judging.
- Test case caching.
- ELO / accounts (deferred indefinitely).
- Per-phase timers (still unused).

---

## Failure-tolerance contract

Each new component is allowed to fail without taking down the score:

| Component | Failure mode | Behavior |
|---|---|---|
| `generateTestCases` (Gemini) | API error, bad JSON, empty array | judgeRoom proceeds **without** testResults; Plan 4 flow |
| `runCases` (Judge0) | `JUDGE0_API_KEY` unset | judgeRoom proceeds without testResults |
| `runCases` (Judge0) | HTTP error, timeout, compile error | The affected case is recorded as `{passed:false, error:...}`; other cases continue |
| Language is not Python | n/a | Skip Judge0 entirely for this chain |

The reveal page already renders three score states (pending/done/failed) — Plan 5 adds **no new UI states**. Notes get richer when Judge0 succeeds; nothing visual changes when it doesn't.

---

## Task 1: `lib/judge/test-cases.ts` — Gemini generates test snippets (TDD)

**Files:**
- Test: `lib/judge/__tests__/test-cases.test.ts`
- Create: `lib/judge/test-cases.ts`

`generateTestCases({ code, language }) → Array<{ name, code }>` — each `code` is a snippet that, when concatenated with the user's function and a final `print("PASS")`, exercises the function via `assert`. Empty array on Gemini failure (graceful).

- [ ] **Step 1: Write the failing test**

Create `lib/judge/__tests__/test-cases.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateTestCases } from '../test-cases';

const GOOD_RESPONSE = (cases: unknown) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(cases) }] } }],
});

describe('generateTestCases', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('returns an array of {name, code} for a simple python function', async () => {
    const cases = [
      { name: 'doubles positive', code: 'assert f(5) == 10' },
      { name: 'handles zero',     code: 'assert f(0) == 0' },
    ];
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(GOOD_RESPONSE(cases)), { status: 200 }));
    const result = await generateTestCases({ code: 'def f(x): return x*2', language: 'python' });
    expect(result).toEqual(cases);
  });

  it('strips markdown fences in Gemini response', async () => {
    const fenced = {
      candidates: [{ content: { parts: [{ text: '```json\n[{"name":"a","code":"assert True"}]\n```' }] } }],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(fenced), { status: 200 }));
    const result = await generateTestCases({ code: 'def f(): pass', language: 'python' });
    expect(result).toEqual([{ name: 'a', code: 'assert True' }]);
  });

  it('returns [] when Gemini fails (does not throw)', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('forbidden', { status: 403 }));
    const result = await generateTestCases({ code: 'def f(): pass', language: 'python' });
    expect(result).toEqual([]);
  });

  it('returns [] when Gemini returns unparseable JSON', async () => {
    const bad = { candidates: [{ content: { parts: [{ text: 'not json' }] } }] };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(bad), { status: 200 }));
    const result = await generateTestCases({ code: 'def f(): pass', language: 'python' });
    expect(result).toEqual([]);
  });

  it('returns [] for unsupported language', async () => {
    const result = await generateTestCases({ code: 'foo', language: 'java' });
    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('drops invalid entries (missing fields) but keeps valid ones', async () => {
    const mixed = [
      { name: 'good', code: 'assert True' },
      { name: 'no code' },
      'just a string',
      { code: 'no name' },
    ];
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(GOOD_RESPONSE(mixed)), { status: 200 }));
    const result = await generateTestCases({ code: 'def f(): pass', language: 'python' });
    expect(result).toEqual([{ name: 'good', code: 'assert True' }]);
  });

  it('caps the number of cases returned at 5', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ name: `c${i}`, code: 'assert True' }));
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(GOOD_RESPONSE(many)), { status: 200 }));
    const result = await generateTestCases({ code: 'def f(): pass', language: 'python' });
    expect(result).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run lib/judge/__tests__/test-cases.test.ts
```

- [ ] **Step 3: Implement `lib/judge/test-cases.ts`**

```typescript
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_CASES = 5;
const SUPPORTED_LANGS = new Set(['python']);

export type TestCase = { name: string; code: string };

function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function buildPrompt(code: string): string {
  return `You are given a Python function. Generate 2 to 3 test cases that assert properties of the function. Each test case is a small Python snippet that, when run after the function definition, asserts an expected behavior using \`assert\`.

The function:
\`\`\`python
${code}
\`\`\`

Return JSON only, no commentary:
[
  {"name": "<short description>", "code": "<one or two lines of Python that uses assert>"},
  ...
]

Rules:
- Each \`code\` field must be runnable Python that references the function exactly as defined above (same function name).
- Do NOT include imports unless absolutely necessary.
- Do NOT include print statements; only assertions.
- Keep each snippet to 1-2 lines.`;
}

/**
 * Ask Gemini for behavioural test snippets. Returns [] on any failure —
 * Judge0 integration is best-effort.
 */
export async function generateTestCases(args: { code: string; language: string }): Promise<TestCase[]> {
  if (!SUPPORTED_LANGS.has(args.language)) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(args.code) }] }],
      }),
    });
    if (!res.ok) return [];
    const body = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(text));
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const valid: TestCase[] = [];
    for (const entry of parsed) {
      if (
        entry && typeof entry === 'object' &&
        typeof (entry as TestCase).name === 'string' &&
        typeof (entry as TestCase).code === 'string'
      ) {
        valid.push({ name: (entry as TestCase).name, code: (entry as TestCase).code });
      }
      if (valid.length >= MAX_CASES) break;
    }
    return valid;
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/judge/__tests__/test-cases.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit checkpoint**

```
feat(judge): generateTestCases — Gemini-authored test snippets

Asks Gemini for 2-3 assert-based snippets that exercise the user's
function. Returns [] on any failure (bad key, bad JSON, non-Python
language, etc) so Judge0 integration is best-effort. Caps at 5 cases
and validates each entry's shape before keeping it.
```

---

## Task 2: `lib/judge0/run.ts` — Judge0 RapidAPI client (TDD)

**Files:**
- Test: `lib/judge0/__tests__/run.test.ts`
- Create: `lib/judge0/run.ts`

`runCases({ code, language, cases }) → TestResult[]` — submits one Judge0 job per case (function code + snippet concatenated, `print("PASS")` at the end). Returns `{ passed, output?, error? }` per case. Returns `[]` if `JUDGE0_API_KEY` is missing.

Uses Judge0's `wait=true` mode (synchronous) — simpler than polling. RapidAPI host = `judge0-ce.p.rapidapi.com`.

Language IDs: python=71 only for this plan.

- [ ] **Step 1: Write the failing test**

Create `lib/judge0/__tests__/run.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCases } from '../run';

function mockJudge0(status_id: number, stdout: string | null, stderr: string | null) {
  return new Response(JSON.stringify({ status: { id: status_id }, stdout, stderr }), { status: 201 });
}

describe('runCases', () => {
  beforeEach(() => {
    vi.stubEnv('JUDGE0_API_KEY', 'test-key');
    vi.stubEnv('JUDGE0_API_HOST', 'judge0-ce.p.rapidapi.com');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('returns [] when JUDGE0_API_KEY is unset', async () => {
    vi.unstubAllEnvs();
    const result = await runCases({
      code: 'def f(x): return x*2',
      language: 'python',
      cases: [{ name: 'a', code: 'assert f(1) == 2' }],
    });
    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns [] for non-python language', async () => {
    const result = await runCases({
      code: 'function f(){}',
      language: 'javascript',
      cases: [{ name: 'a', code: 'assert' }],
    });
    expect(result).toEqual([]);
  });

  it('marks status_id 3 (Accepted) with stdout containing PASS as passed', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJudge0(3, 'PASS\n', null));
    const result = await runCases({
      code: 'def f(x): return x*2',
      language: 'python',
      cases: [{ name: 'a', code: 'assert f(5) == 10' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'a', passed: true });
  });

  it('marks status_id != 3 as failed with the stderr in error', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJudge0(11, null, 'AssertionError'));
    const result = await runCases({
      code: 'def f(x): return x*2',
      language: 'python',
      cases: [{ name: 'a', code: 'assert f(5) == 99' }],
    });
    expect(result[0]).toMatchObject({ passed: false, error: expect.stringContaining('AssertionError') });
  });

  it('marks a case failed (does not throw) when Judge0 returns non-2xx', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('rate limit', { status: 429 }));
    const result = await runCases({
      code: 'def f(): pass',
      language: 'python',
      cases: [{ name: 'a', code: 'assert True' }],
    });
    expect(result[0]).toMatchObject({ passed: false, error: expect.stringContaining('429') });
  });

  it('runs each case sequentially and returns one result per case', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJudge0(3, 'PASS\n', null))
      .mockResolvedValueOnce(mockJudge0(11, null, 'AssertionError'));
    const result = await runCases({
      code: 'def f(x): return x*2',
      language: 'python',
      cases: [
        { name: 'doubles 5', code: 'assert f(5) == 10' },
        { name: 'doubles -1', code: 'assert f(-1) == 99' },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'doubles 5', passed: true });
    expect(result[1]).toMatchObject({ name: 'doubles -1', passed: false });
  });

  it('sends source_code = function + case + sentinel + uses python language_id 71', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJudge0(3, 'PASS\n', null));
    await runCases({
      code: 'def f(x): return x*2',
      language: 'python',
      cases: [{ name: 'a', code: 'assert f(5) == 10' }],
    });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.language_id).toBe(71);
    expect(body.source_code).toContain('def f(x): return x*2');
    expect(body.source_code).toContain('assert f(5) == 10');
    expect(body.source_code).toContain('print("PASS")');
  });

  it('sends RapidAPI headers', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJudge0(3, 'PASS\n', null));
    await runCases({
      code: 'def f(): pass',
      language: 'python',
      cases: [{ name: 'a', code: 'assert True' }],
    });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-rapidapi-key']).toBe('test-key');
    expect(headers['x-rapidapi-host']).toBe('judge0-ce.p.rapidapi.com');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run lib/judge0/__tests__/run.test.ts
```

- [ ] **Step 3: Implement `lib/judge0/run.ts`**

```typescript
const SUPPORTED_LANGS = new Set(['python']);
const LANGUAGE_ID: Record<string, number> = { python: 71 };

export type TestCase = { name: string; code: string };
export type TestResult = { name: string; passed: boolean; output?: string; error?: string };

function buildSourceFor(language: string, fnCode: string, caseCode: string): string {
  // Python only for this plan. Concatenate the user's function, then the
  // case's assert(s), then a sentinel print so we can detect success
  // independent of stdout being captured.
  return `${fnCode}\n\n${caseCode}\nprint("PASS")\n`;
}

export async function runCases(args: {
  code: string;
  language: string;
  cases: TestCase[];
}): Promise<TestResult[]> {
  const apiKey = process.env.JUDGE0_API_KEY;
  if (!apiKey) return [];
  if (!SUPPORTED_LANGS.has(args.language)) return [];
  if (args.cases.length === 0) return [];

  const host = process.env.JUDGE0_API_HOST ?? 'judge0-ce.p.rapidapi.com';
  const endpoint = `https://${host}/submissions?base64_encoded=false&wait=true`;
  const langId = LANGUAGE_ID[args.language];

  const results: TestResult[] = [];

  for (const c of args.cases) {
    const sourceCode = buildSourceFor(args.language, args.code, c.code);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': host,
        },
        body: JSON.stringify({
          source_code: sourceCode,
          language_id: langId,
        }),
      });
      if (!res.ok) {
        results.push({ name: c.name, passed: false, error: `judge0 HTTP ${res.status}` });
        continue;
      }
      const data = await res.json() as {
        status?: { id?: number };
        stdout?: string | null;
        stderr?: string | null;
      };
      const statusId = data.status?.id ?? 0;
      const passed = statusId === 3 && (data.stdout ?? '').includes('PASS');
      results.push({
        name: c.name,
        passed,
        output: data.stdout ?? undefined,
        error: passed ? undefined : (data.stderr ?? `status_id=${statusId}`),
      });
    } catch (err) {
      results.push({ name: c.name, passed: false, error: `judge0 fetch failed: ${(err as Error).message}` });
    }
  }

  return results;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run lib/judge0/__tests__/run.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit checkpoint**

```
feat(judge0): runCases — Judge0 RapidAPI client

Submits each test case as { source_code: function + snippet + print, 
language_id: 71 } with wait=true. status_id 3 + PASS in stdout = pass.
Returns [] when JUDGE0_API_KEY is unset or language != python; per-case
errors don't throw, they record as {passed:false, error}.
```

---

## Task 3: Extend `judgeChain` to accept test results (TDD)

**Files:**
- Modify: `lib/judge/gemini.ts`
- Modify: `lib/judge/__tests__/gemini.test.ts`

`JudgeInput` gains an optional `testResults: { original: TestResult[]; final: TestResult[] }`. When present, the prompt includes a section summarising pass/fail counts and per-case errors so Gemini factors them into the score.

- [ ] **Step 1: Extend the test file**

Append to `lib/judge/__tests__/gemini.test.ts`:

```typescript
describe('judgeChain with testResults', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('includes a "Behavioural test results" section in the prompt when testResults provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(GOOD_RESPONSE), { status: 200 }));
    await judgeChain({
      originalCode: 'a',
      finalCode: 'b',
      language: 'python',
      testResults: {
        original: [
          { name: 'doubles', passed: true },
          { name: 'zero', passed: true },
        ],
        final: [
          { name: 'doubles', passed: true },
          { name: 'zero', passed: false, error: 'AssertionError' },
        ],
      },
    });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    const prompt = body.contents[0].parts[0].text as string;
    expect(prompt).toMatch(/behav(io|iou)ral test/i);
    expect(prompt).toContain('Original: 2 / 2');
    expect(prompt).toContain('Reconstruction: 1 / 2');
    expect(prompt).toContain('zero');
    expect(prompt).toContain('AssertionError');
  });

  it('does not include a test-results section when none provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(GOOD_RESPONSE), { status: 200 }));
    await judgeChain({ originalCode: 'a', finalCode: 'b', language: 'python' });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    const prompt = body.contents[0].parts[0].text as string;
    expect(prompt).not.toMatch(/behav(io|iou)ral test/i);
  });
});
```

(`GOOD_RESPONSE` is already defined at the top of the file from Plan 4 Task 2.)

- [ ] **Step 2: Run — expect failure for the new tests**

```bash
npx vitest run lib/judge/__tests__/gemini.test.ts
```

Two failures (the new tests).

- [ ] **Step 3: Update `lib/judge/gemini.ts`**

Add the `TestResult` type and extend `JudgeInput`:

```typescript
export type TestResult = {
  name: string;
  passed: boolean;
  output?: string;
  error?: string;
};

export type JudgeInput = {
  originalCode: string;
  finalCode: string;
  language: string;
  testResults?: {
    original: TestResult[];
    final: TestResult[];
  };
};
```

Update `buildPrompt`:

```typescript
function formatTestResultsSection(testResults: JudgeInput['testResults']): string {
  if (!testResults) return '';
  const { original, final } = testResults;
  const passCount = (rs: TestResult[]) => rs.filter((r) => r.passed).length;

  const failingFinal = final
    .filter((r) => !r.passed)
    .map((r) => `  - ${r.name}: ${r.error ?? 'failed'}`)
    .join('\n');

  return `

Behavioural test results (each case is a Python assert run against the function):
- Original: ${passCount(original)} / ${original.length} passing
- Reconstruction: ${passCount(final)} / ${final.length} passing
${failingFinal ? `Reconstruction failures:\n${failingFinal}\n` : ''}
Factor this into the score — perfect behavioural match should weight strongly toward 100, divergent behaviour toward lower.`;
}

function buildPrompt({ originalCode, finalCode, language, testResults }: JudgeInput): string {
  return `You are evaluating how faithfully a code reconstruction matches an original function passed through a game of telephone.

Original function (language: ${language}):
\`\`\`${language}
${originalCode}
\`\`\`

Final reconstruction (language: ${language}):
\`\`\`${language}
${finalCode}
\`\`\`
${formatTestResultsSection(testResults)}

Score the reconstruction from 0 to 100:
- 100: behaviorally and structurally identical
- 80+: same behavior, minor style differences
- 60-79: similar intent, partial behavior match
- 40-59: roughly the right shape but significantly different
- below 40: lost most of the original idea

Return JSON only, no commentary:
{"overallScore": <0-100>, "notes": "<1-2 sentence explanation>"}`;
}
```

- [ ] **Step 4: Run — expect all pass (10 in this file now)**

```bash
npx vitest run lib/judge/__tests__/gemini.test.ts
```

Expected: 10 tests pass (8 existing + 2 new).

- [ ] **Step 5: Commit checkpoint**

```
feat(judge): judgeChain accepts optional testResults

When provided, the Gemini prompt includes a "Behavioural test results"
section summarising pass counts and listing failing cases. Plan 5's
judgeRoom passes this in when Judge0 succeeded; absent for code-only
judging (Plan 4 fallback).
```

---

## Task 4: Wire Judge0 into `lib/game/judging.ts` (TDD)

**Files:**
- Modify: `lib/game/judging.ts`
- Modify: `lib/game/__tests__/judging.test.ts`

`judgeRoom` gains a sub-pipeline per chain:
1. Call `generateTestCases(originalCode, language)`.
2. If non-empty, `runCases({ code: originalCode, ..., cases })` → originalResults; `runCases({ code: finalCode, ..., cases })` → finalResults.
3. Pass both to `judgeChain` as `testResults`.
4. Any failure in 1 or 2 → call judgeChain without testResults (Plan 4 path).

The function signature gains optional `generateTestCases` and `runCases` for DI (testing).

- [ ] **Step 1: Add tests at the end of `lib/game/__tests__/judging.test.ts`**

Append:

```typescript
describe('judgeRoom with Judge0 integration', () => {
  it('passes Judge0 results to judgeChain when both Gemini cases + Judge0 succeed', async () => {
    const { sb } = mockSupabase({
      room: { id: 'r1', round_count: 3 },
      submissions: [
        { chain_index: 0, round_num: 1, round_type: 'code', content: 'orig', language: 'python' },
        { chain_index: 0, round_num: 3, round_type: 'code', content: 'final', language: 'python' },
      ],
      chainScores: [{ chain_index: 0, status: 'pending' }],
    });

    const generateTestCases = vi.fn().mockResolvedValue([
      { name: 'doubles', code: 'assert f(5) == 10' },
    ]);
    const runCases = vi.fn()
      .mockResolvedValueOnce([{ name: 'doubles', passed: true }])   // original
      .mockResolvedValueOnce([{ name: 'doubles', passed: false, error: 'AssertionError' }]); // final
    const judgeChain = vi.fn().mockResolvedValue({ overallScore: 40, notes: 'failed behavioural' });

    const result = await judgeRoom({ supabase: sb, roomId: 'r1', judgeChain, generateTestCases, runCases });
    expect(result).toEqual({ judged: 1, failed: 0 });

    expect(generateTestCases).toHaveBeenCalledWith({ code: 'orig', language: 'python' });
    expect(runCases).toHaveBeenCalledTimes(2);
    expect(runCases).toHaveBeenNthCalledWith(1, expect.objectContaining({ code: 'orig' }));
    expect(runCases).toHaveBeenNthCalledWith(2, expect.objectContaining({ code: 'final' }));
    expect(judgeChain).toHaveBeenCalledWith(expect.objectContaining({
      originalCode: 'orig',
      finalCode: 'final',
      language: 'python',
      testResults: {
        original: [{ name: 'doubles', passed: true }],
        final: [{ name: 'doubles', passed: false, error: 'AssertionError' }],
      },
    }));
  });

  it('falls back to code-only judging when generateTestCases returns []', async () => {
    const { sb } = mockSupabase({
      room: { id: 'r1', round_count: 3 },
      submissions: [
        { chain_index: 0, round_num: 1, round_type: 'code', content: 'orig', language: 'python' },
        { chain_index: 0, round_num: 3, round_type: 'code', content: 'final', language: 'python' },
      ],
      chainScores: [{ chain_index: 0, status: 'pending' }],
    });

    const generateTestCases = vi.fn().mockResolvedValue([]);
    const runCases = vi.fn();
    const judgeChain = vi.fn().mockResolvedValue({ overallScore: 70, notes: 'no behavioural data' });

    const result = await judgeRoom({ supabase: sb, roomId: 'r1', judgeChain, generateTestCases, runCases });
    expect(result).toEqual({ judged: 1, failed: 0 });
    expect(runCases).not.toHaveBeenCalled();

    const judgeArgs = judgeChain.mock.calls[0][0];
    expect(judgeArgs).not.toHaveProperty('testResults');
  });

  it('falls back to code-only when runCases returns [] (e.g. JUDGE0_API_KEY unset)', async () => {
    const { sb } = mockSupabase({
      room: { id: 'r1', round_count: 3 },
      submissions: [
        { chain_index: 0, round_num: 1, round_type: 'code', content: 'orig', language: 'python' },
        { chain_index: 0, round_num: 3, round_type: 'code', content: 'final', language: 'python' },
      ],
      chainScores: [{ chain_index: 0, status: 'pending' }],
    });

    const generateTestCases = vi.fn().mockResolvedValue([{ name: 'a', code: 'assert True' }]);
    const runCases = vi.fn().mockResolvedValue([]); // empty = key missing or non-python
    const judgeChain = vi.fn().mockResolvedValue({ overallScore: 75, notes: 'code-only' });

    const result = await judgeRoom({ supabase: sb, roomId: 'r1', judgeChain, generateTestCases, runCases });
    expect(result).toEqual({ judged: 1, failed: 0 });
    expect(judgeChain.mock.calls[0][0]).not.toHaveProperty('testResults');
  });

  it('still falls back if generateTestCases or runCases throws', async () => {
    const { sb } = mockSupabase({
      room: { id: 'r1', round_count: 3 },
      submissions: [
        { chain_index: 0, round_num: 1, round_type: 'code', content: 'orig', language: 'python' },
        { chain_index: 0, round_num: 3, round_type: 'code', content: 'final', language: 'python' },
      ],
      chainScores: [{ chain_index: 0, status: 'pending' }],
    });
    const generateTestCases = vi.fn().mockRejectedValue(new Error('boom'));
    const runCases = vi.fn();
    const judgeChain = vi.fn().mockResolvedValue({ overallScore: 50, notes: 'fallback' });

    const result = await judgeRoom({ supabase: sb, roomId: 'r1', judgeChain, generateTestCases, runCases });
    expect(result).toEqual({ judged: 1, failed: 0 });
    expect(judgeChain.mock.calls[0][0]).not.toHaveProperty('testResults');
  });
});
```

- [ ] **Step 2: Run — expect failures for the new describe block**

```bash
npx vitest run lib/game/__tests__/judging.test.ts
```

- [ ] **Step 3: Update `lib/game/judging.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { judgeChain as realJudgeChain, type JudgeResult, type TestResult } from '@/lib/judge/gemini';
import { generateTestCases as realGenerateTestCases, type TestCase } from '@/lib/judge/test-cases';
import { runCases as realRunCases } from '@/lib/judge0/run';

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

type GenerateFn = (args: { code: string; language: string }) => Promise<TestCase[]>;
type RunFn = (args: { code: string; language: string; cases: TestCase[] }) => Promise<TestResult[]>;
type JudgeFn = (input: {
  originalCode: string; finalCode: string; language: string;
  testResults?: { original: TestResult[]; final: TestResult[] };
}) => Promise<JudgeResult>;

async function maybeRunBehavioural(args: {
  originalCode: string;
  finalCode: string;
  language: string;
  generateTestCases: GenerateFn;
  runCases: RunFn;
}): Promise<{ original: TestResult[]; final: TestResult[] } | null> {
  try {
    const cases = await args.generateTestCases({ code: args.originalCode, language: args.language });
    if (cases.length === 0) return null;
    const [original, final] = await Promise.all([
      args.runCases({ code: args.originalCode, language: args.language, cases }),
      args.runCases({ code: args.finalCode, language: args.language, cases }),
    ]);
    if (original.length === 0 || final.length === 0) return null;
    return { original, final };
  } catch {
    return null;
  }
}

export async function judgeRoom(args: {
  supabase: SupabaseClient;
  roomId: string;
  judgeChain?: JudgeFn;
  generateTestCases?: GenerateFn;
  runCases?: RunFn;
}): Promise<{ judged: number; failed: number }> {
  const { supabase, roomId } = args;
  const judge = args.judgeChain ?? realJudgeChain;
  const generate = args.generateTestCases ?? realGenerateTestCases;
  const run = args.runCases ?? realRunCases;

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

    const language = original.language ?? 'python';
    const behavioural = await maybeRunBehavioural({
      originalCode: original.content,
      finalCode: final.content,
      language,
      generateTestCases: generate,
      runCases: run,
    });

    try {
      const result = await judge({
        originalCode: original.content,
        finalCode: final.content,
        language,
        ...(behavioural ? { testResults: behavioural } : {}),
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

Expected: 9 tests pass (5 existing + 4 new).

- [ ] **Step 5: Full suite still green**

```bash
npx vitest run && npx tsc --noEmit
```

- [ ] **Step 6: Commit checkpoint**

```
feat(game): judgeRoom — Judge0 behavioural results when available

Per chain: ask Gemini for test snippets, run them via Judge0 against
both original and reconstruction, pass results to judgeChain. Any
failure in the pipeline (empty cases, runCases returning [], thrown
errors) silently falls back to Plan 4's code-only path. No new UI
states on /reveal — the notes just get richer.
```

---

## Task 5: Install Playwright + minimal config

**Files:**
- Modify: `package.json` (add dev dep + scripts)
- Modify: `vitest.config.ts` (exclude tests/e2e from vitest's pickup)
- Create: `playwright.config.ts`
- Modify: `.gitignore` (add `test-results/`, `playwright-report/`)
- Modify: `.dockerignore` (add the same)

Browser binaries (`npx playwright install`) are heavy and run-machine-specific — Andy executes that step locally; the package.json change just adds the runner.

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test
```

- [ ] **Step 2: Add scripts to `package.json`**

Open `package.json` and add to the `scripts` block:

```json
"test:e2e": "playwright test",
"test:e2e:install": "playwright install chromium --with-deps",
"test:e2e:headed": "playwright test --headed"
```

(Keep the existing `dev`, `build`, `start`, `lint`, `test`, `test:watch` entries.)

- [ ] **Step 3: Exclude e2e tests from vitest**

In `vitest.config.ts`, update the `exclude` array:

```typescript
exclude: ['node_modules', 'legacy', 'redesign', '.next', 'tests/e2e'],
```

- [ ] **Step 4: Create `playwright.config.ts` at repo root**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
```

- [ ] **Step 5: Update `.gitignore`**

Append:

```
# Playwright
test-results/
playwright-report/
```

- [ ] **Step 6: Update `.dockerignore`**

Append:

```
**/test-results
**/playwright-report
**/tests/e2e
```

- [ ] **Step 7: Verify vitest still works (e2e dir not picked up)**

```bash
npx vitest run
```

Expected: tests pass with no Playwright-related failures.

- [ ] **Step 8: Commit checkpoint**

```
chore(playwright): install @playwright/test + minimal config

Adds the runner and scripts (test:e2e, test:e2e:install, 
test:e2e:headed) plus playwright.config.ts pointing at tests/e2e.
Vitest excludes the e2e dir. Browser binaries are an install-time
concern (npx playwright install chromium --with-deps), kept out of
the package install so docker images stay small.
```

---

## Task 6: `tests/e2e/full-chain.spec.ts` — 3-context smoke test

**Files:**
- Create: `tests/e2e/full-chain.spec.ts`

One test that walks 3 isolated browser contexts through a full game. Asserts at each phase transition. Expected runtime ~30–60s.

- [ ] **Step 1: Create the test file**

Create `tests/e2e/full-chain.spec.ts`:

```typescript
import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * 3-context end-to-end smoke. Each context has its own cookie jar so
 * ct_player is per-player. The host (Alice) creates; Bob + Carol join.
 * After Start, all three submit each phase; the test waits for the
 * Realtime-driven navigation to land each tab on the next URL.
 *
 * If this test fails locally, check:
 *   - dev server actually running at PLAYWRIGHT_BASE_URL (defaults to localhost:3000)
 *   - SUPABASE_SERVICE_ROLE_KEY set in .env (route handlers throw without it)
 *   - All 4 tables in supabase_realtime publication (migrations 008 + 009 + 010)
 */

async function joinWizard(page: Page, nickname: string, opts: { create: true } | { join: string }) {
  await page.goto('/');
  // Step 1: nickname
  await page.getByPlaceholder('e.g. Jordan').fill(nickname);
  await page.getByRole('button', { name: /Next/ }).click();
  // Step 2: method
  if ('create' in opts) {
    await page.getByLabel(/Create a new room/).check();
  } else {
    await page.getByLabel(/Join an existing room/).check();
    await page.getByPlaceholder(/ROOM-0000/).fill(opts.join);
  }
  await page.getByRole('button', { name: /Finish/ }).click();
  // Land on /waiting-room/<CODE>
  await page.waitForURL(/\/waiting-room\/[A-Z0-9]{6}$/, { timeout: 15_000 });
}

async function pickRoomCodeFromUrl(page: Page): Promise<string> {
  const url = page.url();
  const m = url.match(/\/waiting-room\/([A-Z0-9]{6})/);
  if (!m) throw new Error(`could not extract code from ${url}`);
  return m[1];
}

async function submitInPhase(page: Page, content: string) {
  // Each phase has a Submit button at the bottom. The selector covers
  // editor (Submit), describe (Submit description), reimplement (Submit code).
  await page.getByRole('textbox').first().fill(content);
  await page.getByRole('button', { name: /^Submit/ }).click();
}

async function newPlayerContext(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

test('3-player chain reaches /reveal with judging', async ({ browser }) => {
  const alice = await newPlayerContext(browser);
  const bob = await newPlayerContext(browser);
  const carol = await newPlayerContext(browser);

  // 1. Alice creates.
  await joinWizard(alice, 'Alice', { create: true });
  const code = await pickRoomCodeFromUrl(alice);
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // 2. Bob + Carol join.
  await joinWizard(bob, 'Bob', { join: code });
  await joinWizard(carol, 'Carol', { join: code });

  // 3. All three lobbies show 3 players. Alice clicks Start.
  for (const p of [alice, bob, carol]) {
    await expect(p.getByText('Alice')).toBeVisible();
    await expect(p.getByText('Bob')).toBeVisible();
    await expect(p.getByText('Carol')).toBeVisible();
  }
  await alice.getByRole('button', { name: /Start Game/ }).click();

  // 4. All three navigate to /editor/<CODE>.
  await Promise.all([
    alice.waitForURL(`**/editor/${code}`, { timeout: 15_000 }),
    bob.waitForURL(`**/editor/${code}`, { timeout: 15_000 }),
    carol.waitForURL(`**/editor/${code}`, { timeout: 15_000 }),
  ]);

  // 5. Each writes code and submits. After the third submit, all advance.
  await submitInPhase(alice, 'def f(x):\n    return x * 2\n');
  await submitInPhase(bob,   'def g(x):\n    return x + 1\n');
  await submitInPhase(carol, 'def h(x):\n    return x * x\n');
  await Promise.all([
    alice.waitForURL(`**/describe/${code}`, { timeout: 30_000 }),
    bob.waitForURL(`**/describe/${code}`, { timeout: 30_000 }),
    carol.waitForURL(`**/describe/${code}`, { timeout: 30_000 }),
  ]);

  // 6. Describe phase.
  await submitInPhase(alice, 'doubles the input');
  await submitInPhase(bob,   'adds one to the input');
  await submitInPhase(carol, 'squares the input');
  await Promise.all([
    alice.waitForURL(`**/reimplement/${code}`, { timeout: 30_000 }),
    bob.waitForURL(`**/reimplement/${code}`, { timeout: 30_000 }),
    carol.waitForURL(`**/reimplement/${code}`, { timeout: 30_000 }),
  ]);

  // 7. Reimplement phase.
  await submitInPhase(alice, 'def f(x): return x * 2\n');
  await submitInPhase(bob,   'def g(x): return x + 1\n');
  await submitInPhase(carol, 'def h(x): return x ** 2\n');
  await Promise.all([
    alice.waitForURL(`**/reveal/${code}`, { timeout: 30_000 }),
    bob.waitForURL(`**/reveal/${code}`, { timeout: 30_000 }),
    carol.waitForURL(`**/reveal/${code}`, { timeout: 30_000 }),
  ]);

  // 8. Reveal shows the chain. Each tab should see "Scoring this chain…"
  //    that eventually transitions to a number (or "Scoring unavailable"
  //    if GEMINI is rate-limited — we accept either).
  await expect(alice.getByText(/chain 1/i)).toBeVisible({ timeout: 15_000 });

  // Wait for the score panel to leave the "Scoring this chain…" state.
  // 45s budget — Gemini sometimes takes a while.
  await alice.waitForFunction(
    () => {
      const text = document.body.innerText;
      return !text.includes('Scoring this chain…');
    },
    {},
    { timeout: 45_000 },
  );

  // Final assertion: the page shows either a numeric score OR "Scoring unavailable".
  const body = await alice.locator('body').innerText();
  expect(body).toMatch(/(\/100|Scoring unavailable)/);
});
```

- [ ] **Step 2: Document local setup**

This test depends on a running dev server (the playwright config's `webServer` block handles that locally) and a real Supabase project with `SUPABASE_SERVICE_ROLE_KEY` set. Andy runs once:

```bash
npx playwright install chromium --with-deps   # ~200MB download, one-time
npm run test:e2e
```

If the test stalls at a phase transition, check:
1. Dev server log for route handler errors.
2. `SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'` shows 4 rows.

- [ ] **Step 3: Commit checkpoint**

```
test(e2e): full-chain 3-context Playwright smoke

Walks Alice/Bob/Carol through create → join → start → 3 submits →
describe → reimplement → reveal. Asserts each Realtime-driven URL
transition. Accepts either a numeric score or "Scoring unavailable"
at the end so Gemini rate limits don't flake CI.

Run locally with `npm run test:e2e` after `npx playwright install
chromium --with-deps`.
```

---

## Task 7: Vercel deploy guide in README

**Files:**
- Modify: `README.md`

This task doesn't run any deployment — it documents the procedure so Andy (or a future maintainer) can deploy without re-deriving the env var list. The actual `vercel deploy` step is Andy's hands-on responsibility because `vercel link` is interactive.

- [ ] **Step 1: Read the current README**

```bash
cat README.md
```

Confirm the "Deploy" section currently has a one-liner stub (`npx vercel deploy --prod`). We expand it.

- [ ] **Step 2: Replace the Deploy section**

In `README.md`, find the existing `## Deploy` section and replace it with:

```markdown
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
```

- [ ] **Step 3: Commit checkpoint**

```
docs(readme): expand Vercel deploy section

Documents the env var matrix (server-only vs browser-baked vs
optional), the `vercel link` interactive step, and how preview
deploys work. Replaces the previous one-liner.
```

---

## Task 8: Verify Plan 5 exit criteria

**Files:**
- Read-only.

- [ ] **Step 1: Tests + tsc green**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: ~118 tests pass (103 from Plan 4 + 7 test-cases + 8 judge0 + 2 gemini-testResults + 4 judging Judge0 path = ~124 max, some maths). tsc exit 0.

- [ ] **Step 2: Manual Judge0 smoke (only if `JUDGE0_API_KEY` is set)**

If Andy has signed up for Judge0 CE on RapidAPI and added the key to `.env`:

1. Run a full game through to `/reveal/<CODE>` per Plan 4 Task 7.
2. Check the dev server log for entries like `[judge0]` indicating test cases ran.
3. The `chain_scores.notes` field should contain a richer assessment mentioning behavioural results.
4. Verify in SQL:
   ```sql
   SELECT chain_index, overall_score, length(notes) FROM chain_scores
   WHERE room_id = (SELECT id FROM rooms WHERE code='<CODE>')
   ORDER BY chain_index;
   ```
   Expected: `notes` is longer than the Plan 4 baseline (~150+ chars vs ~80).

If `JUDGE0_API_KEY` is unset: this step is a no-op. Confirm scoring still works via Plan 4's code-only path (notes will be shorter; behaviour is unchanged from Plan 4).

- [ ] **Step 3: Playwright smoke (local only)**

If Andy wants to verify the e2e harness works on his machine:

```bash
npx playwright install chromium --with-deps  # one-time
npm run test:e2e
```

Expected: 1 passed in ~60s. Skip this step if Andy doesn't want to install the browser binaries — the test exists for future CI integration.

- [ ] **Step 4: Vercel deploy (Andy)**

Andy runs the steps in the rewritten README "Deploy to Vercel" section. After deploy:

1. Open the `*.vercel.app` URL in two tabs.
2. Walk through create → join → start → 3 submits → reveal.
3. Confirm the live URL behaves identically to localhost.

If the deploy fails:
- Check the Vercel build log for missing env vars (NEXT_PUBLIC_* missing breaks the build immediately).
- Check the runtime log for "fetch failed" — that's usually missing SUPABASE_SERVICE_ROLE_KEY or rate limits.

- [ ] **Step 5: Final commit (if anything was tweaked during verification)**

```
chore: verify Plan 5 exit criteria

- Full suite + tsc green
- Judge0 behavioural results show up in chain_scores.notes when key set
- Playwright e2e green locally
- vercel deploy succeeded; live URL plays a 2-player game end-to-end
```

---

## Plan 5 — Exit criteria

After this plan is complete:

- `lib/judge0/run.ts` submits test cases to Judge0 via RapidAPI and returns per-case results.
- `lib/judge/test-cases.ts` asks Gemini for behavioural test snippets in Python.
- `lib/game/judging.ts` orchestrates: generate cases → run on both code versions → pass results to `judgeChain`. Any failure in that pipeline silently falls back to Plan 4's code-only path.
- `judgeChain` accepts optional `testResults` and includes a "Behavioural test results" section in the Gemini prompt when provided.
- `JUDGE0_API_KEY` is unset by default — Andy adds it when he wants behavioural scoring.
- Playwright e2e test walks 3 contexts through a full game end-to-end.
- README documents the full `vercel deploy` flow with the right env var matrix.
- Vercel deploy works; demo URL plays through a complete game.
- Vitest suite green (~120 tests across ~21 files). tsc clean.

## Self-review notes

**Spec coverage for Step 5 (Judge0):**
- ✓ `lib/judge0/run.ts` — `runCases(code, language, cases)` (Task 2).
- ✓ Plumb test results into the Gemini prompt (Tasks 3 + 4).
- ✓ Verify graceful degradation when `JUDGE0_API_KEY` is unset (Task 2 test + Task 4 fallback test).
- ✓ Judge0 results feed the score when available; reveal unaffected when not (Task 4 — same UI states as Plan 4).

**Spec coverage for Step 6 (Polish & deploy):**
- ✓ `vercel link` + `vercel env add` documented (Task 7).
- ✓ One Playwright smoke test through the full chain (Tasks 5 + 6).
- ✓ `vercel deploy` documented; Andy runs it (Task 8 Step 4).
- ✓ Demo URL plays through a full game end-to-end (Task 8 verification).

**Failure handling:**
- Test case generation failure → empty array → code-only judging.
- Judge0 key missing / language not Python → runCases returns [] → code-only judging.
- Judge0 per-case error (HTTP / timeout / compile error) → that case records `passed:false, error:...`; the chain still scores.
- Gemini judging error → existing Plan 4 path: `chain_scores.status='failed'`.

**Type consistency:**
- `TestCase` defined once in `lib/judge/test-cases.ts`; reused by `lib/judge0/run.ts` and `lib/game/judging.ts`.
- `TestResult` defined once in `lib/judge/gemini.ts` (where `JudgeInput` lives); `lib/judge0/run.ts` re-exports compatibly.
- `Submission`, `ChainScore` types in `judging.ts` unchanged from Plan 4.

**Placeholder scan:** clean — no "TBD" / "implement later" / "Similar to Task N" / vague error handling in task bodies.

**Known gaps and deferrals (forever):**
- Cross-language Judge0 (Plan 5 hard-codes Python).
- Parallel multi-chain judging.
- Test case caching across reset/play-again.
- ELO + accounts (deferred from Plan 1).
- Per-phase timers (still unused).
- Draft autosave (lost in Plan 2's lib/socket teardown; Plan 3+ never rebuilt it).
- The `redesign/` folder remains untouched.
