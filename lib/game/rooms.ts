import type { SupabaseClient } from '@supabase/supabase-js';
import { GameError, type ErrorCode } from './errors';
import { generateRoomCode } from './codes';

// PL/pgSQL RPCs raise with `'CODE: message'` strings. Extract the code
// so route handlers can map to the right HTTP status; fall back to
// INTERNAL when no known prefix is present.
const KNOWN_RPC_CODES: ErrorCode[] = [
  'ROOM_NOT_FOUND',
  'NAME_TAKEN',
  'NOT_HOST',
  'NOT_ENOUGH_PLAYERS',
  'GAME_IN_PROGRESS',
  'INVALID_SUBMIT',
];
function parseRpcError(err: { message?: string } | null | undefined): GameError {
  const message = err?.message ?? '';
  for (const code of KNOWN_RPC_CODES) {
    const needle = `${code}:`;
    const idx = message.indexOf(needle);
    if (idx !== -1) {
      const tail = message.slice(idx + needle.length).trim().split('\n')[0];
      return new GameError(code, tail || code);
    }
  }
  return new GameError('INTERNAL', message || 'unknown rpc error');
}

const MAX_CODE_RETRIES = 5;

function normalizeName(raw: string): string {
  return raw.trim();
}
function nameKey(raw: string): string {
  return normalizeName(raw).toLowerCase();
}

/* ── createRoom ────────────────────────────────────────────────────── */
export async function createRoom(args: {
  supabase: SupabaseClient;
  name: string;
  roundCount: number;
}): Promise<{ roomId: string; code: string; playerId: string }> {
  const { supabase, name, roundCount } = args;
  const cleanName = normalizeName(name);
  if (!cleanName) throw new GameError('INTERNAL', 'name is required');
  if (![3, 5].includes(roundCount)) throw new GameError('INTERNAL', 'roundCount must be 3 or 5');

  // Insert room with a fresh code; retry on the 23505 unique-violation that
  // a code collision would produce.
  let roomRow: { id: string; code: string } | null = null;
  let lastErr: any = null;
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from('rooms')
      .insert({ code, round_count: roundCount, status: 'lobby', phase: 'lobby' })
      .select()
      .single();
    if (!error && data) {
      roomRow = { id: data.id, code: data.code };
      break;
    }
    lastErr = error;
    // 23505 = unique_violation in Postgres; on anything else, bail.
    if (error?.code && error.code !== '23505') break;
  }
  if (!roomRow) throw new GameError('INTERNAL', `failed to insert room: ${lastErr?.message ?? 'unknown'}`);

  // Insert the host player.
  const { data: playerData, error: playerErr } = await supabase
    .from('players')
    .insert({ name: cleanName, room_id: roomRow.id, is_host: true })
    .select()
    .single();
  if (playerErr || !playerData) {
    throw new GameError('INTERNAL', `failed to insert host player: ${playerErr?.message ?? 'unknown'}`);
  }

  // Backfill rooms.host_id to point at the host we just inserted.
  await supabase.from('rooms').update({ host_id: playerData.id }).eq('id', roomRow.id);

  return { roomId: roomRow.id, code: roomRow.code, playerId: playerData.id };
}

/* ── joinRoom ──────────────────────────────────────────────────────── */
export async function joinRoom(args: {
  supabase: SupabaseClient;
  code: string;
  name: string;
}): Promise<{ roomId: string; code: string; playerId: string; hostId: string | null }> {
  const { supabase, code, name } = args;
  const cleanName = normalizeName(name);
  if (!cleanName) throw new GameError('INTERNAL', 'name is required');

  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select('id, code, status, host_id')
    .eq('code', code)
    .maybeSingle();
  if (roomErr) throw new GameError('INTERNAL', `room lookup failed: ${roomErr.message}`);
  if (!room) throw new GameError('ROOM_NOT_FOUND', `no room with code ${code}`);
  if (room.status !== 'lobby') throw new GameError('GAME_IN_PROGRESS', 'room is no longer in lobby');

  // Name collision check (case-insensitive, trimmed).
  const { data: existing, error: listErr } = await supabase
    .from('players')
    .select('name')
    .eq('room_id', room.id);
  if (listErr) throw new GameError('INTERNAL', `player lookup failed: ${listErr.message}`);
  const collision = (existing ?? []).some((p: { name: string }) => nameKey(p.name) === nameKey(cleanName));
  if (collision) throw new GameError('NAME_TAKEN', `nickname "${cleanName}" already in this room`);

  const { data: playerData, error: insertErr } = await supabase
    .from('players')
    .insert({ name: cleanName, room_id: room.id, is_host: false })
    .select()
    .single();
  if (insertErr || !playerData) {
    throw new GameError('INTERNAL', `failed to insert player: ${insertErr?.message ?? 'unknown'}`);
  }

  return { roomId: room.id, code: room.code, playerId: playerData.id, hostId: room.host_id };
}

/* ── leaveRoom ─────────────────────────────────────────────────────── */
export async function leaveRoom(args: {
  supabase: SupabaseClient;
  playerId: string;
  roomId: string;
}): Promise<{ hostTransferredTo: string | null; roomRemainingCount: number }> {
  const { supabase, playerId, roomId } = args;
  const { data, error } = await supabase.rpc('leave_room', {
    p_player_id: playerId,
    p_room_id: roomId,
  });
  if (error) throw new GameError('INTERNAL', `leave_room rpc failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    hostTransferredTo: row?.host_transferred_to ?? null,
    roomRemainingCount: row?.room_remaining_count ?? 0,
  };
}

/* ── kickPlayer ────────────────────────────────────────────────────── */
export async function kickPlayer(args: {
  supabase: SupabaseClient;
  hostId: string;
  roomId: string;
  targetId: string;
}): Promise<{ roomRemainingCount: number }> {
  const { supabase, hostId, roomId, targetId } = args;
  const { data, error } = await supabase.rpc('kick_player', {
    p_host_id: hostId,
    p_room_id: roomId,
    p_target_id: targetId,
  });
  if (error) throw parseRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return { roomRemainingCount: row?.room_remaining_count ?? 0 };
}

/* ── terminateRoom ─────────────────────────────────────────────────── */
export async function terminateRoom(args: {
  supabase: SupabaseClient;
  hostId: string;
  roomId: string;
}): Promise<{ terminated: boolean }> {
  const { supabase, hostId, roomId } = args;
  const { data, error } = await supabase.rpc('terminate_room', {
    p_host_id: hostId,
    p_room_id: roomId,
  });
  if (error) throw parseRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return { terminated: Boolean(row?.terminated) };
}

/* ── forceAdvanceTimer ─────────────────────────────────────────────── */
export async function forceAdvanceTimer(args: {
  supabase: SupabaseClient;
  hostId: string;
  roomId: string;
}): Promise<{ currentRound: number }> {
  const { supabase, hostId, roomId } = args;
  const { data, error } = await supabase.rpc('force_advance_timer', {
    p_host_id: hostId,
    p_room_id: roomId,
  });
  if (error) throw parseRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return { currentRound: row?.current_round ?? 0 };
}

/* ── flushPhase ────────────────────────────────────────────────────── */
export async function flushPhase(args: {
  supabase: SupabaseClient;
  hostId: string;
  roomId: string;
  expectedRound: number;
}): Promise<{ newPhase: string; newRound: number; advanced: boolean }> {
  const { supabase, hostId, roomId, expectedRound } = args;
  const { data, error } = await supabase.rpc('flush_phase', {
    p_host_id: hostId,
    p_room_id: roomId,
    p_expected_round: expectedRound,
  });
  if (error) throw parseRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    newPhase: row?.new_phase ?? '',
    newRound: row?.new_round ?? 0,
    advanced: Boolean(row?.advanced),
  };
}

/* ── updateRoomSettings ────────────────────────────────────────────── */
export async function updateRoomSettings(args: {
  supabase: SupabaseClient;
  hostId: string;
  roomId: string;
  promptsEnabled?: boolean;
  phaseDurationSeconds?: number;
}): Promise<{ promptsEnabled: boolean; phaseDurationSeconds: number }> {
  const { supabase, hostId, roomId, promptsEnabled, phaseDurationSeconds } = args;
  const { data, error } = await supabase.rpc('update_room_settings', {
    p_host_id: hostId,
    p_room_id: roomId,
    p_prompts_enabled: promptsEnabled ?? null,
    p_phase_duration_seconds: phaseDurationSeconds ?? null,
  });
  if (error) throw parseRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    promptsEnabled: Boolean(row?.prompts_enabled),
    phaseDurationSeconds: row?.phase_duration_seconds ?? 0,
  };
}
