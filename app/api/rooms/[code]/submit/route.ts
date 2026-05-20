import { NextResponse, type NextRequest } from 'next/server';
import { submitTurn } from '@/lib/game/round';
import { getServiceClient } from '@/lib/supabase/server';
import { readSessionCookie } from '@/lib/auth/session';
import { GameError, ERROR_CODES, type ErrorCode } from '@/lib/game/errors';
import { isValidRoomCode } from '@/lib/game/codes';

const LANGS: ReadonlyArray<'python' | 'javascript' | 'java'> = ['python', 'javascript', 'java'];

function statusFor(code: ErrorCode): number {
  switch (code) {
    case ERROR_CODES.ROOM_NOT_FOUND: return 404;
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

  let body: unknown;
  try { body = await request.json(); }
  catch { return envelope('INVALID_SUBMIT', 'body must be JSON', 400); }

  const b = body as { content?: unknown; language?: unknown };
  const content = typeof b?.content === 'string' ? b.content : null;
  if (!content || content.length === 0) {
    return envelope('INVALID_SUBMIT', 'content (string) is required', 400);
  }

  let language: 'python' | 'javascript' | 'java' | null = null;
  if (b?.language !== undefined && b.language !== null) {
    if (typeof b.language !== 'string' || !LANGS.includes(b.language as never)) {
      return envelope('INVALID_SUBMIT', 'language must be python/javascript/java', 400);
    }
    language = b.language as 'python' | 'javascript' | 'java';
  }

  try {
    const result = await submitTurn({
      supabase: getServiceClient(),
      playerId: session.playerId,
      roomId: session.roomId,
      content,
      language,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GameError) return envelope(err.code, err.message, statusFor(err.code));
    console.error('[POST /api/rooms/[code]/submit] unexpected', err);
    return envelope('INTERNAL', 'unexpected server error', 500);
  }
}
