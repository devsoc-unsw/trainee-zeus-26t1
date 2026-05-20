import { NextResponse, after, type NextRequest } from 'next/server';
import { judgeRoom } from '@/lib/game/judging';
import { getServiceClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await ctx.params;
  if (!UUID_RE.test(roomId)) {
    return NextResponse.json(
      { error: { code: 'INVALID_SUBMIT', message: 'roomId must be a uuid' } },
      { status: 400 },
    );
  }

  after(async () => {
    try {
      await judgeRoom({ supabase: getServiceClient(), roomId });
    } catch (err) {
      console.error('[POST /api/judge/[roomId]] judgeRoom failed', err);
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
