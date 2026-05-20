import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/game/round', () => ({ resetGame: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));

import { POST } from '../route';
import { resetGame } from '@/lib/game/round';
import { GameError } from '@/lib/game/errors';
import { signSession } from '@/lib/auth/session';

const SECRET = 'test-secret-XXXXXXXXXXXXXXXXXXXXXXXXXX';

function req(code: string, token: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['cookie'] = `ct_player=${token}`;
  return new NextRequest(`http://localhost/api/rooms/${code}/reset`, { method: 'POST', headers });
}

describe('POST /api/rooms/[code]/reset', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.mocked(resetGame).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('200 on success', async () => {
    vi.mocked(resetGame).mockResolvedValue({ ok: true });
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('403 on NOT_HOST', async () => {
    vi.mocked(resetGame).mockRejectedValue(new GameError('NOT_HOST', 'nope'));
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(403);
  });

  it('401 with no cookie', async () => {
    const res = await POST(req('ABCD12', null), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(401);
  });

  it('400 when [code] is malformed', async () => {
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('lower', token), { params: Promise.resolve({ code: 'lower' }) });
    expect(res.status).toBe(400);
  });
});
