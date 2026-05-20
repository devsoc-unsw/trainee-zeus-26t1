import { NextResponse, type NextRequest } from 'next/server';
import { createRoom } from '@/lib/game/rooms';
import { getServiceClient } from '@/lib/supabase/server';
import { setSessionCookie } from '@/lib/auth/session';
import { GameError, ERROR_CODES, type ErrorCode } from '@/lib/game/errors';

function statusFor(code: ErrorCode): number {
  switch (code) {
    case ERROR_CODES.ROOM_NOT_FOUND: return 404;
    case ERROR_CODES.NAME_TAKEN:     return 409;
    case ERROR_CODES.NOT_HOST:       return 403;
    case ERROR_CODES.GAME_IN_PROGRESS:    return 409;
    case ERROR_CODES.NOT_ENOUGH_PLAYERS:  return 400;
    case ERROR_CODES.INVALID_SUBMIT: return 400;
    default:                         return 500;
  }
}

function envelope(code: ErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return envelope('INVALID_SUBMIT', 'body must be JSON', 400);
  }

  const b = body as { name?: unknown; roundCount?: unknown };
  const name = typeof b?.name === 'string' ? b.name : null;
  const roundCount = b?.roundCount;
  if (!name || (roundCount !== 3 && roundCount !== 5)) {
    return envelope('INVALID_SUBMIT', 'name (string) and roundCount (3|5) are required', 400);
  }

  try {
    const result = await createRoom({ supabase: getServiceClient(), name, roundCount });
    const res = NextResponse.json(result, { status: 200 });
    setSessionCookie(res, { playerId: result.playerId, roomId: result.roomId });
    return res;
  } catch (err) {
    if (err instanceof GameError) {
      return envelope(err.code, err.message, statusFor(err.code));
    }
    console.error('[POST /api/rooms] unexpected error', err);
    return envelope('INTERNAL', 'unexpected server error', 500);
  }
}
