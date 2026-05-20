import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/game/round', () => ({ startGame: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));

import { POST } from '../route';
import { startGame } from '@/lib/game/round';
import { GameError } from '@/lib/game/errors';
import { signSession } from '@/lib/auth/session';

const SECRET = 'test-secret-XXXXXXXXXXXXXXXXXXXXXXXXXX';

function req(code: string, token: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['cookie'] = `ct_player=${token}`;
  return new NextRequest(`http://localhost/api/rooms/${code}/start`, { method: 'POST', headers });
}

describe('POST /api/rooms/[code]/start', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.mocked(startGame).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('200 + { roundCount } on success', async () => {
    vi.mocked(startGame).mockResolvedValue({ roundCount: 3 });
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ roundCount: 3 });
  });

  it('401 with no cookie', async () => {
    const res = await POST(req('ABCD12', null), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(401);
  });

  it('403 on NOT_HOST', async () => {
    vi.mocked(startGame).mockRejectedValue(new GameError('NOT_HOST', 'nope'));
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(403);
  });

  it('400 on NOT_ENOUGH_PLAYERS', async () => {
    vi.mocked(startGame).mockRejectedValue(new GameError('NOT_ENOUGH_PLAYERS', 'need 2'));
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(400);
  });

  it('400 when [code] is malformed', async () => {
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('lower', token), { params: Promise.resolve({ code: 'lower' }) });
    expect(res.status).toBe(400);
  });
});
