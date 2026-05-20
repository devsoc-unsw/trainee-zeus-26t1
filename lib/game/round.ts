import type { SupabaseClient } from '@supabase/supabase-js';
import { GameError, ERROR_CODES, type ErrorCode } from './errors';

const KNOWN_CODES: ReadonlyArray<ErrorCode> = [
  ERROR_CODES.ROOM_NOT_FOUND,
  ERROR_CODES.NAME_TAKEN,
  ERROR_CODES.NOT_HOST,
  ERROR_CODES.NOT_ENOUGH_PLAYERS,
  ERROR_CODES.GAME_IN_PROGRESS,
  ERROR_CODES.INVALID_SUBMIT,
  ERROR_CODES.INTERNAL,
];

/**
 * Postgres RAISE EXCEPTION messages look like `CODE: human message`.
 * Strip the prefix and turn it into a GameError; unknown prefixes
 * bubble as INTERNAL with the full text.
 */
function rpcError(err: { message?: string } | null | undefined): GameError {
  const msg = err?.message ?? 'unknown rpc error';
  for (const code of KNOWN_CODES) {
    const prefix = code + ':';
    if (msg.startsWith(prefix)) {
      return new GameError(code, msg.slice(prefix.length).trim());
    }
  }
  return new GameError('INTERNAL', msg);
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data) && data.length > 0) return data[0] as T;
  if (data && typeof data === 'object') return data as T;
  return null;
}

/* ── startGame ─────────────────────────────────────────────────────── */
export async function startGame(args: {
  supabase: SupabaseClient;
  playerId: string;
  roomId: string;
}): Promise<{ roundCount: number }> {
  const { data, error } = await args.supabase.rpc('start_game', {
    p_player_id: args.playerId,
    p_room_id: args.roomId,
  });
  if (error) throw rpcError(error);
  const row = firstRow<{ round_count: number }>(data);
  if (!row) throw new GameError('INTERNAL', 'start_game returned no row');
  return { roundCount: row.round_count };
}

/* ── submitTurn ────────────────────────────────────────────────────── */
export async function submitTurn(args: {
  supabase: SupabaseClient;
  playerId: string;
  roomId: string;
  content: string;
  language: 'python' | 'javascript' | 'java' | null;
}): Promise<{ advanced: boolean; newPhase: string; newRound: number }> {
  const { data, error } = await args.supabase.rpc('submit_turn', {
    p_player_id: args.playerId,
    p_room_id: args.roomId,
    p_content: args.content,
    p_language: args.language,
  });
  if (error) throw rpcError(error);
  const row = firstRow<{ advanced: boolean; new_phase: string; new_round: number }>(data);
  if (!row) throw new GameError('INTERNAL', 'submit_turn returned no row');
  return { advanced: row.advanced, newPhase: row.new_phase, newRound: row.new_round };
}

/* ── resetGame ─────────────────────────────────────────────────────── */
export async function resetGame(args: {
  supabase: SupabaseClient;
  playerId: string;
  roomId: string;
}): Promise<{ ok: true }> {
  const { error } = await args.supabase.rpc('reset_game', {
    p_player_id: args.playerId,
    p_room_id: args.roomId,
  });
  if (error) throw rpcError(error);
  return { ok: true };
}
