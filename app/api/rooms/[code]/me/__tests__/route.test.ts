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
