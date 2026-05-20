import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SECRET = 'test-secret-base64-or-whatever-32-bytes-XXXXXXXXXXXXX';

describe('signSession / verifySession', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SESSION_SECRET', SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips a valid payload', async () => {
    const { signSession, verifySession } = await import('../session');
    const payload = { playerId: 'p1', roomId: 'r1' };
    const token = signSession(payload, SECRET);
    expect(typeof token).toBe('string');
    expect(token).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(verifySession(token, SECRET)).toEqual(payload);
  });

  it('returns null when the signature is tampered', async () => {
    const { signSession, verifySession } = await import('../session');
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const [body, sig] = token.split('.');
    const tampered = body + '.' + sig.split('').reverse().join('');
    expect(verifySession(tampered, SECRET)).toBeNull();
  });

  it('returns null when the body is tampered', async () => {
    const { signSession, verifySession } = await import('../session');
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const [body, sig] = token.split('.');
    const tampered = body.replace(/A/g, 'B') + '.' + sig;
    if (tampered !== token) {
      expect(verifySession(tampered, SECRET)).toBeNull();
    }
  });

  it('returns null for a different secret', async () => {
    const { signSession, verifySession } = await import('../session');
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    expect(verifySession(token, 'wrong-secret')).toBeNull();
  });

  it('returns null for malformed input', async () => {
    const { verifySession } = await import('../session');
    expect(verifySession('not-a-token', SECRET)).toBeNull();
    expect(verifySession('', SECRET)).toBeNull();
    expect(verifySession('a.b.c', SECRET)).toBeNull();
  });
});

describe('setSessionCookie / readSessionCookie', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SESSION_SECRET', SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('setSessionCookie writes a signed cookie with the expected attributes', async () => {
    const { setSessionCookie } = await import('../session');
    const cookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
    const response = {
      cookies: {
        set: (name: string, value: string, options: Record<string, unknown>) =>
          cookies.push({ name, value, options }),
      },
    };
    setSessionCookie(response, { playerId: 'p1', roomId: 'r1' });
    expect(cookies).toHaveLength(1);
    expect(cookies[0].name).toBe('ct_player');
    expect(cookies[0].value).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(cookies[0].options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    });
  });

  it('readSessionCookie returns the verified payload', async () => {
    const { signSession, readSessionCookie } = await import('../session');
    const token = signSession({ playerId: 'p1', roomId: 'r1' }, SECRET);
    const request = {
      cookies: { get: (name: string) => (name === 'ct_player' ? { value: token } : undefined) },
    };
    expect(readSessionCookie(request)).toEqual({ playerId: 'p1', roomId: 'r1' });
  });

  it('readSessionCookie returns null when cookie is absent', async () => {
    const { readSessionCookie } = await import('../session');
    const request = { cookies: { get: () => undefined } };
    expect(readSessionCookie(request)).toBeNull();
  });

  it('clearSessionCookie sets ct_player to empty with maxAge 0', async () => {
    const { clearSessionCookie } = await import('../session');
    const cookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
    const response = {
      cookies: {
        set: (name: string, value: string, options: Record<string, unknown>) =>
          cookies.push({ name, value, options }),
      },
    };
    clearSessionCookie(response);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ name: 'ct_player', value: '', options: { maxAge: 0, path: '/' } });
  });
});
