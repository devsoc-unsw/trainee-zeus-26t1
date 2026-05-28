import { NextResponse, type NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { readSessionCookie, clearSessionCookie } from '@/lib/auth/session';

/**
 * GET /api/me — used by the home page to decide whether to auto-redirect
 * a returning player back into their game.
 *
 * Returns { playerId, roomCode, phase } if the session cookie maps to a
 * still-existing player + room. Returns 401 (with the cookie cleared) if
 * the cookie is missing, invalid, or stale (room or player gone — e.g.
 * after being kicked).
 */
export async function GET(request: NextRequest) {
  const session = readSessionCookie(request);
  if (!session) {
    return NextResponse.json({ error: 'no session' }, { status: 401 });
  }

  const sb = getServiceClient();

  const { data: room } = await sb
    .from('rooms')
    .select('code, phase')
    .eq('id', session.roomId)
    .maybeSingle();
  if (!room) {
    const res = NextResponse.json({ error: 'room gone' }, { status: 401 });
    clearSessionCookie(res);
    return res;
  }

  const { data: player } = await sb
    .from('players')
    .select('id')
    .eq('id', session.playerId)
    .eq('room_id', session.roomId)
    .maybeSingle();
  if (!player) {
    // Player was kicked or left from another tab — clear the stale cookie.
    const res = NextResponse.json({ error: 'player gone' }, { status: 401 });
    clearSessionCookie(res);
    return res;
  }

  return NextResponse.json({
    playerId: session.playerId,
    roomCode: (room as { code: string }).code,
    phase: (room as { phase: string }).phase,
  });
}
