import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/game/rooms', () => ({
  createRoom: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: vi.fn(() => ({})),
}));

import { POST } from '../route';
import { createRoom } from '@/lib/game/rooms';
import { GameError } from '@/lib/game/errors';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/rooms', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret-XXXXXXXXXXXXXXXXXXXXXXXXXX');
    vi.mocked(createRoom).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns 200 + room ids and sets ct_player cookie', async () => {
    vi.mocked(createRoom).mockResolvedValue({
      roomId: 'r1', code: 'ABCD12', playerId: 'p1',
    });

    const res = await POST(jsonRequest({ name: 'Alice', roundCount: 3 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ roomId: 'r1', code: 'ABCD12', playerId: 'p1' });

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('ct_player=');
    expect(setCookie.toLowerCase()).toContain('httponly');
  });

  it('400 when body is missing name', async () => {
    const res = await POST(jsonRequest({ roundCount: 3 }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_SUBMIT');
  });

  it('400 when roundCount is not 3 or 5', async () => {
    const res = await POST(jsonRequest({ name: 'Alice', roundCount: 4 }) as never);
    expect(res.status).toBe(400);
  });

  it('translates GameError to its envelope with the matching status', async () => {
    vi.mocked(createRoom).mockRejectedValue(new GameError('INTERNAL', 'boom'));
    const res = await POST(jsonRequest({ name: 'Alice', roundCount: 3 }) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
  });

  it('returns 500 + INTERNAL envelope on unexpected error', async () => {
    vi.mocked(createRoom).mockRejectedValue(new Error('weird'));
    const res = await POST(jsonRequest({ name: 'Alice', roundCount: 3 }) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
  });
});
