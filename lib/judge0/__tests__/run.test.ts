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
