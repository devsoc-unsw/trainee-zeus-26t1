import { NextResponse, type NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { readSessionCookie } from '@/lib/auth/session';
import { isValidRoomCode } from '@/lib/game/codes';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  if (!isValidRoomCode(code)) {
    return NextResponse.json({ error: { code: 'INVALID_SUBMIT', message: 'invalid room code' } }, { status: 400 });
  }

  const session = readSessionCookie(request);
  if (!session) {
    return NextResponse.json({ error: { code: 'INVALID_SUBMIT', message: 'no valid session' } }, { status: 401 });
  }

  const sb = getServiceClient();
  const { data, error } = await sb
    .from('players')
    .select('id, seat_index, is_host')
    .eq('id', session.playerId)
    .eq('room_id', session.roomId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message } }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: { code: 'ROOM_NOT_FOUND', message: 'player or room missing' } }, { status: 404 });
  }

  return NextResponse.json({
    playerId: session.playerId,
    roomId: session.roomId,
    seatIndex: (data as { seat_index: number | null }).seat_index,
    isHost: !!(data as { is_host: boolean }).is_host,
  });
}
