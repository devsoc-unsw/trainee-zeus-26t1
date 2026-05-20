import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/game/round', () => ({ submitTurn: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));

import { POST } from '../route';
import { submitTurn } from '@/lib/game/round';
import { GameError } from '@/lib/game/errors';
import { signSession } from '@/lib/auth/session';

const SECRET = 'test-secret-XXXXXXXXXXXXXXXXXXXXXXXXXX';

function req(code: string, body: unknown, token: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['cookie'] = `ct_player=${token}`;
  return new NextRequest(`http://localhost/api/rooms/${code}/submit`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

describe('POST /api/rooms/[code]/submit', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.mocked(submitTurn).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('200 with advanced/newPhase/newRound on success', async () => {
    vi.mocked(submitTurn).mockResolvedValue({ advanced: true, newPhase: 'describing', newRound: 2 });
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', { content: 'x', language: 'python' }, token),
                           { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ advanced: true, newPhase: 'describing', newRound: 2 });
  });

  it('passes language=null when omitted (describe phase)', async () => {
    vi.mocked(submitTurn).mockResolvedValue({ advanced: false, newPhase: 'describing', newRound: 2 });
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', { content: 'this is text' }, token),
                           { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(vi.mocked(submitTurn)).toHaveBeenCalledWith({
      supabase: {}, playerId: 'p1', roomId: 'r1', content: 'this is text', language: null,
    });
  });

  it('400 when body has no content', async () => {
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', {}, token), { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(400);
  });

  it('400 INVALID_SUBMIT envelope on RPC reject', async () => {
    vi.mocked(submitTurn).mockRejectedValue(new GameError('INVALID_SUBMIT', 'already submitted'));
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const res = await POST(req('ABCD12', { content: 'x', language: 'python' }, token),
                           { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_SUBMIT');
  });

  it('401 when no cookie', async () => {
    const res = await POST(req('ABCD12', { content: 'x', language: 'python' }, null),
                           { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(401);
  });
});
