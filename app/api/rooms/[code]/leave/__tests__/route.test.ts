import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/game/rooms', () => ({ leaveRoom: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));

import { POST } from '../route';
import { leaveRoom } from '@/lib/game/rooms';
import { signSession } from '@/lib/auth/session';

const SECRET = 'test-secret-XXXXXXXXXXXXXXXXXXXXXXXXXX';

function reqWithCookie(code: string, cookieToken: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookieToken) headers['cookie'] = `ct_player=${cookieToken}`;
  return new NextRequest(`http://localhost/api/rooms/${code}/leave`, {
    method: 'POST',
    headers,
  });
}

describe('POST /api/rooms/[code]/leave', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.mocked(leaveRoom).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('200, calls leaveRoom with cookie playerId/roomId, clears cookie', async () => {
    vi.mocked(leaveRoom).mockResolvedValue({ hostTransferredTo: 'p3', roomRemainingCount: 1 });
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(reqWithCookie('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hostTransferredTo: 'p3', roomRemainingCount: 1 });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/ct_player=;.*max-age=0/i);
    expect(vi.mocked(leaveRoom)).toHaveBeenCalledWith({
      supabase: {},
      playerId: 'p1',
      roomId: 'r1',
    });
  });

  it('401 if no cookie present', async () => {
    const res = await POST(reqWithCookie('ABCD12', null), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(401);
  });

  it('401 if cookie signature is invalid', async () => {
    const res = await POST(reqWithCookie('ABCD12', 'forged.token'), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(401);
  });

  it('400 when [code] is malformed', async () => {
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(reqWithCookie('bad', token), { params: Promise.resolve({ code: 'bad' }) });
    expect(res.status).toBe(400);
  });
});
