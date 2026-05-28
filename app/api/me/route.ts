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
    .select('*')
    .eq('id', session.playerId)
    .eq('room_id', session.roomId)
    .maybeSingle();
  if (!player) {
    // Player was kicked-from-lobby or left from another tab — clear cookie.
    const res = NextResponse.json({ error: 'player gone' }, { status: 401 });
    clearSessionCookie(res);
    return res;
  }
  // Mid-game soft-kick (migration 023+): is_active=false acts like "gone".
  // Pre-migration the column doesn't exist and this check is a no-op.
  if ((player as { is_active?: boolean }).is_active === false) {
    const res = NextResponse.json({ error: 'player kicked' }, { status: 401 });
    clearSessionCookie(res);
    return res;
  }

  return NextResponse.json({
    playerId: session.playerId,
    roomCode: (room as { code: string }).code,
    phase: (room as { phase: string }).phase,
  });
}
