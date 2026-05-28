import { NextResponse, type NextRequest } from 'next/server';
import { kickPlayer } from '@/lib/game/rooms';
import { getServiceClient } from '@/lib/supabase/server';
import { readSessionCookie } from '@/lib/auth/session';
import { GameError, ERROR_CODES, type ErrorCode } from '@/lib/game/errors';
import { isValidRoomCode } from '@/lib/game/codes';

function statusFor(code: ErrorCode): number {
  switch (code) {
    case ERROR_CODES.ROOM_NOT_FOUND:   return 404;
    case ERROR_CODES.NOT_HOST:         return 403;
    case ERROR_CODES.GAME_IN_PROGRESS: return 409;
    case ERROR_CODES.INVALID_SUBMIT:   return 400;
    default:                           return 500;
  }
}
function envelope(code: ErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  if (!isValidRoomCode(code)) {
    return envelope('INVALID_SUBMIT', 'invalid room code in URL', 400);
  }

  const session = readSessionCookie(request);
  if (!session) {
    return NextResponse.json(
      { error: { code: 'INVALID_SUBMIT', message: 'no valid session cookie' } },
      { status: 401 },
    );
  }

  let body: { playerId?: unknown };
  try {
    body = await request.json();
  } catch {
    return envelope('INVALID_SUBMIT', 'invalid JSON body', 400);
  }
  const targetId = typeof body?.playerId === 'string' ? body.playerId : null;
  if (!targetId) {
    return envelope('INVALID_SUBMIT', 'playerId is required', 400);
  }

  try {
    const result = await kickPlayer({
      supabase: getServiceClient(),
      hostId: session.playerId,
      roomId: session.roomId,
      targetId,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GameError) return envelope(err.code, err.message, statusFor(err.code));
    console.error('[POST /api/rooms/[code]/kick] unexpected', err);
    return envelope('INTERNAL', 'unexpected server error', 500);
  }
}
