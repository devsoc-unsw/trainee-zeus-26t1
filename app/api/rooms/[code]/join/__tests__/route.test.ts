import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/game/rooms', () => ({ joinRoom: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));

import { POST } from '../route';
import { joinRoom } from '@/lib/game/rooms';
import { GameError } from '@/lib/game/errors';

function req(body: unknown) {
  return new Request('http://localhost/api/rooms/ABCD12/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/rooms/[code]/join', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-secret-XXXXXXXXXXXXXXXXXXXXXXXXXX');
    vi.mocked(joinRoom).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('200 with payload and ct_player cookie set', async () => {
    vi.mocked(joinRoom).mockResolvedValue({ roomId: 'r1', code: 'ABCD12', playerId: 'p2', hostId: 'p1' });
    const res = await POST(req({ name: 'Bob' }) as never, { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ roomId: 'r1', code: 'ABCD12', playerId: 'p2', hostId: 'p1' });
    expect(res.headers.get('set-cookie') ?? '').toContain('ct_player=');
  });

  it('400 with INVALID_SUBMIT when code in URL is malformed', async () => {
    const res = await POST(req({ name: 'Bob' }) as never, { params: Promise.resolve({ code: 'lowercase' }) });
    expect(res.status).toBe(400);
  });

  it('404 with ROOM_NOT_FOUND envelope', async () => {
    vi.mocked(joinRoom).mockRejectedValue(new GameError('ROOM_NOT_FOUND', 'nope'));
    const res = await POST(req({ name: 'Bob' }) as never, { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(404);
  });

  it('409 with NAME_TAKEN envelope', async () => {
    vi.mocked(joinRoom).mockRejectedValue(new GameError('NAME_TAKEN', 'in use'));
    const res = await POST(req({ name: 'Bob' }) as never, { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(409);
  });

  it('400 when name missing', async () => {
    const res = await POST(req({}) as never, { params: Promise.resolve({ code: 'ABCD12' }) });
    expect(res.status).toBe(400);
  });
});
