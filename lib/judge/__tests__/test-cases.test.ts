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
