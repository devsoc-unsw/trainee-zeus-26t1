import { NextResponse, type NextRequest } from 'next/server';
import { forceAdvanceTimer, flushPhase } from '@/lib/game/rooms';
import { getServiceClient } from '@/lib/supabase/server';
import { readSessionCookie } from '@/lib/auth/session';
import { GameError, ERROR_CODES, type ErrorCode } from '@/lib/game/errors';
import { isValidRoomCode } from '@/lib/game/codes';

function statusFor(code: ErrorCode): number {
  switch (code) {
    case ERROR_CODES.ROOM_NOT_FOUND: return 404;
    case ERROR_CODES.NOT_HOST:       return 403;
    case ERROR_CODES.INVALID_SUBMIT: return 400;
    default:                         return 500;
  }
}
function envelope(code: ErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const CLIENT_DRAFT_GRACE_MS = 5000;

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
    const supabase = getServiceClient();

    // Step 1: rewind the timer so every online client's secondsLeft
    // recomputes to 0 and the existing auto-submit useEffect fires with
    // each player's current draft.
    const { currentRound } = await forceAdvanceTimer({
      supabase, hostId: session.playerId, roomId: session.roomId,
    });

    // Step 2: give online clients a moment to submit their drafts.
    await new Promise((r) => setTimeout(r, CLIENT_DRAFT_GRACE_MS));

    // Step 3: flush empty submissions for anyone who still hasn't
    // submitted (closed tabs, disconnected). Idempotent — bails if the
    // round has already advanced naturally during the grace window.
    const result = await flushPhase({
      supabase, hostId: session.playerId, roomId: session.roomId,
      expectedRound: currentRound,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GameError) return envelope(err.code, err.message, statusFor(err.code));
    console.error('[POST /api/rooms/[code]/force-advance] unexpected', err);
    return envelope('INTERNAL', 'unexpected server error', 500);
  }
}
