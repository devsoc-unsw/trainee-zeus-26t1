import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoom, joinRoom, leaveRoom } from '../rooms';
import { GameError } from '../errors';

/**
 * Build a fluent-chain mock that mirrors what rooms.ts calls on the
 * Supabase client. Each test customises the final resolved value via
 * the responses map.
 *
 * The shape rooms.ts uses:
 *   sb.from('rooms').insert({...}).select().single()
 *   sb.from('players').insert({...}).select().single()
 *   sb.from('rooms').select('id, code, status, host_id').eq('code', code).maybeSingle()
 *   sb.from('players').select('name').eq('room_id', id) → returns array (awaited directly)
 *   sb.from('rooms').update({...}).eq('id', id)       → fire-and-forget (awaited)
 *   sb.rpc('leave_room', { p_player_id, p_room_id })   → returns array
 */
function mockSupabase(responses: Record<string, any>) {
  const calls: any[] = [];
  const chain: any = {
    _table: null as string | null,
    _payload: null as any,
    _verb:  null as null | 'insert' | 'update' | 'select',
    from(table: string) { this._table = table; this._payload = null; this._verb = null; calls.push({ op: 'from', table }); return this; },
    insert(payload: any) { this._payload = payload; this._verb = 'insert'; calls.push({ op: 'insert', table: this._table, payload }); return this; },
    update(payload: any) { this._payload = payload; this._verb = 'update'; calls.push({ op: 'update', table: this._table, payload }); return this; },
    select(_cols?: string) { if (!this._verb) this._verb = 'select'; calls.push({ op: 'select', table: this._table }); return this; },
    eq(col: string, val: any) { calls.push({ op: 'eq', table: this._table, col, val }); return this; },
    order(_col: string, _opts?: any) { return this; },
    single() {
      const key = `single:${this._table}:${this._verb}`;
      const r = responses[key];
      if (!r) throw new Error(`mock missing response for ${key}`);
      return Promise.resolve(r);
    },
    maybeSingle() {
      const key = `maybeSingle:${this._table}`;
      const r = responses[key];
      if (!r) throw new Error(`mock missing response for ${key}`);
      return Promise.resolve(r);
    },
    // Awaiting the chain without .single() / .maybeSingle() — covers both
    // list selects ("from(t).select('cols').eq(...)") and fire-and-forget
    // updates ("from(t).update(...).eq(...)"). For fire-and-forget the
    // test doesn't need to set a response — return { data: null, error: null }.
    then(resolve: any) {
      const verb = this._verb;
      const table = this._table;
      const key = verb === 'update' ? `update:${table}` : `list:${table}`;
      const r = responses[key] ?? { data: null, error: null };
      resolve(r);
    },
    rpc(name: string, args: any) {
      calls.push({ op: 'rpc', name, args });
      const key = `rpc:${name}`;
      const r = responses[key];
      if (!r) throw new Error(`mock missing response for ${key}`);
      return Promise.resolve(r);
    },
  };
  return { sb: chain, calls };
}

describe('createRoom', () => {
  it('inserts a room then a host player, returns ids', async () => {
    const { sb, calls } = mockSupabase({
      'single:rooms:insert':   { data: { id: 'room-uuid-1', code: 'ABCD12' }, error: null },
      'single:players:insert': { data: { id: 'player-uuid-1' }, error: null },
    });

    const result = await createRoom({ supabase: sb, name: 'Alice', roundCount: 3 });
    expect(result).toEqual({ roomId: 'room-uuid-1', code: 'ABCD12', playerId: 'player-uuid-1' });

    const roomInsert = calls.find((c) => c.op === 'insert' && c.table === 'rooms');
    expect(roomInsert.payload).toMatchObject({ round_count: 3 });
    expect(roomInsert.payload.code).toMatch(/^[A-Z0-9]{6}$/);

    const playerInsert = calls.find((c) => c.op === 'insert' && c.table === 'players');
    expect(playerInsert.payload).toMatchObject({ name: 'Alice', room_id: 'room-uuid-1', is_host: true });
  });

  it('throws GameError INTERNAL on rooms insert error (non-unique-violation)', async () => {
    const { sb } = mockSupabase({
      'single:rooms:insert': { data: null, error: { message: 'db down', code: '42000' } },
    });
    await expect(createRoom({ supabase: sb, name: 'Alice', roundCount: 3 }))
      .rejects.toBeInstanceOf(GameError);
  });
});

describe('joinRoom', () => {
  beforeEach(() => {});

  it('finds room by code, rejects on name collision (case-insensitive)', async () => {
    const { sb } = mockSupabase({
      'maybeSingle:rooms': { data: { id: 'room-1', code: 'ABCD12', status: 'lobby', host_id: 'p0' }, error: null },
      'list:players': { data: [{ name: 'alice' }, { name: 'Bob' }], error: null },
    });
    await expect(joinRoom({ supabase: sb, code: 'ABCD12', name: '  ALICE  ' }))
      .rejects.toMatchObject({ code: 'NAME_TAKEN' });
  });

  it('inserts the player when the room exists and name is free', async () => {
    const { sb } = mockSupabase({
      'maybeSingle:rooms':       { data: { id: 'room-1', code: 'ABCD12', status: 'lobby', host_id: 'p0' }, error: null },
      'list:players':            { data: [{ name: 'Bob' }], error: null },
      'single:players:insert':   { data: { id: 'player-new' }, error: null },
    });
    const result = await joinRoom({ supabase: sb, code: 'ABCD12', name: 'Alice' });
    expect(result).toEqual({ roomId: 'room-1', code: 'ABCD12', playerId: 'player-new', hostId: 'p0' });
  });

  it('throws ROOM_NOT_FOUND when no row matches the code', async () => {
    const { sb } = mockSupabase({
      'maybeSingle:rooms': { data: null, error: null },
    });
    await expect(joinRoom({ supabase: sb, code: 'NOPE42', name: 'Alice' }))
      .rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
  });

  it('throws GAME_IN_PROGRESS when room.status is not lobby', async () => {
    const { sb } = mockSupabase({
      'maybeSingle:rooms': { data: { id: 'room-1', code: 'ABCD12', status: 'active', host_id: 'p0' }, error: null },
    });
    await expect(joinRoom({ supabase: sb, code: 'ABCD12', name: 'Alice' }))
      .rejects.toMatchObject({ code: 'GAME_IN_PROGRESS' });
  });
});

describe('leaveRoom', () => {
  it('calls the leave_room RPC and returns its result', async () => {
    const { sb, calls } = mockSupabase({
      'rpc:leave_room': { data: [{ host_transferred_to: 'p2', room_remaining_count: 2 }], error: null },
    });
    const result = await leaveRoom({ supabase: sb, playerId: 'p1', roomId: 'r1' });
    expect(result).toEqual({ hostTransferredTo: 'p2', roomRemainingCount: 2 });
    expect(calls.find((c) => c.op === 'rpc' && c.name === 'leave_room').args)
      .toEqual({ p_player_id: 'p1', p_room_id: 'r1' });
  });

  it('handles RPC returning host_transferred_to = null (non-host left)', async () => {
    const { sb } = mockSupabase({
      'rpc:leave_room': { data: [{ host_transferred_to: null, room_remaining_count: 1 }], error: null },
    });
    const result = await leaveRoom({ supabase: sb, playerId: 'p2', roomId: 'r1' });
    expect(result.hostTransferredTo).toBeNull();
    expect(result.roomRemainingCount).toBe(1);
  });

  it('throws GameError INTERNAL on RPC error', async () => {
    const { sb } = mockSupabase({
      'rpc:leave_room': { data: null, error: { message: 'function not found' } },
    });
    await expect(leaveRoom({ supabase: sb, playerId: 'p1', roomId: 'r1' }))
      .rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
