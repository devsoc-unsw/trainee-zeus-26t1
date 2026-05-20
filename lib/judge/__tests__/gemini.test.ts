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
