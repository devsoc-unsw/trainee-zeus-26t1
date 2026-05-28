import { NextResponse, type NextRequest } from 'next/server';
import { updateRoomSettings } from '@/lib/game/rooms';
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

export async function PATCH(
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

  let body: { promptsEnabled?: unknown; phaseDurationSeconds?: unknown };
  try {
    body = await request.json();
  } catch {
    return envelope('INVALID_SUBMIT', 'invalid JSON body', 400);
  }
  const promptsEnabled = typeof body?.promptsEnabled === 'boolean' ? body.promptsEnabled : undefined;
  const phaseDurationSeconds = typeof body?.phaseDurationSeconds === 'number' ? body.phaseDurationSeconds : undefined;
  if (promptsEnabled === undefined && phaseDurationSeconds === undefined) {
    return envelope('INVALID_SUBMIT', 'at least one of promptsEnabled or phaseDurationSeconds is required', 400);
  }

  try {
    const result = await updateRoomSettings({
      supabase: getServiceClient(),
      hostId: session.playerId,
      roomId: session.roomId,
      promptsEnabled,
      phaseDurationSeconds,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GameError) return envelope(err.code, err.message, statusFor(err.code));
    console.error('[PATCH /api/rooms/[code]/settings] unexpected', err);
    return envelope('INTERNAL', 'unexpected server error', 500);
  }
}
