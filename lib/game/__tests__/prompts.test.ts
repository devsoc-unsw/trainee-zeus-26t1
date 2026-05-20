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
