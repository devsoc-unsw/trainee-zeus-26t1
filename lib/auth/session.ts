import { createHmac, timingSafeEqual } from 'node:crypto';

export type SessionPayload = { playerId: string; roomId: string };

const COOKIE_NAME = 'ct_player';
const MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

function b64urlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const std = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(std, 'base64');
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token: string, secret: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = b64urlEncode(createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  try {
    const json = b64urlDecode(body).toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.playerId !== 'string' || typeof parsed.roomId !== 'string') return null;
    return { playerId: parsed.playerId, roomId: parsed.roomId };
  } catch {
    return null;
  }
}

function requireSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

type CookieJar = { set: (name: string, value: string, options: Record<string, unknown>) => unknown };
type ResponseLike = { cookies: CookieJar };
type RequestLike = { cookies: { get: (name: string) => { value: string } | undefined } };

export function setSessionCookie(response: ResponseLike, payload: SessionPayload): void {
  const token = signSession(payload, requireSecret());
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export function readSessionCookie(request: RequestLike): SessionPayload | null {
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifySession(raw, requireSecret());
}

export function clearSessionCookie(response: ResponseLike): void {
  response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
}
