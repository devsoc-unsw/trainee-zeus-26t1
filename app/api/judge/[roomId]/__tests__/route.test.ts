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
    expect(vi.mocked(judgeRoom)).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
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
    await expect(afterCallbacks[0]()).resolves.toBeUndefined();
  });
});
