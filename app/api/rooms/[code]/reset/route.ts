import { NextResponse, type NextRequest } from 'next/server';
import { resetGame } from '@/lib/game/round';
import { getServiceClient } from '@/lib/supabase/server';
import { readSessionCookie } from '@/lib/auth/session';
import { GameError, ERROR_CODES, type ErrorCode } from '@/lib/game/errors';
import { isValidRoomCode } from '@/lib/game/codes';

function statusFor(code: ErrorCode): number {
  switch (code) {
    case ERROR_CODES.ROOM_NOT_FOUND: return 404;
    case ERROR_CODES.NOT_HOST: return 403;
    case ERROR_CODES.INVALID_SUBMIT: return 400;
    default: return 500;
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

  try {
    const result = await resetGame({
      supabase: getServiceClient(),
      playerId: session.playerId,
      roomId: session.roomId,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GameError) return envelope(err.code, err.message, statusFor(err.code));
    console.error('[POST /api/rooms/[code]/reset] unexpected', err);
    return envelope('INTERNAL', 'unexpected server error', 500);
  }
}
