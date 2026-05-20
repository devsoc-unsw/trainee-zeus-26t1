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
