import { describe, it, expect, vi } from 'vitest';
import { startGame, submitTurn, resetGame } from '../round';
import { GameError } from '../errors';

function mockSupabase(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    rpc: vi.fn((name: string) => Promise.resolve(responses[`rpc:${name}`] ?? { data: null, error: null })),
  } as never;
}

describe('startGame', () => {
  it('returns round_count on success', async () => {
    const sb = mockSupabase({ 'rpc:start_game': { data: [{ round_count: 3 }], error: null } });
    const result = await startGame({ supabase: sb, playerId: 'p1', roomId: 'r1' });
    expect(result).toEqual({ roundCount: 3 });
  });
  it('translates NOT_HOST exception into GameError', async () => {
    const sb = mockSupabase({
      'rpc:start_game': { data: null, error: { message: 'NOT_HOST: only the host can start' } },
    });
    await expect(startGame({ supabase: sb, playerId: 'p1', roomId: 'r1' }))
      .rejects.toMatchObject({ code: 'NOT_HOST' });
  });
  it('translates NOT_ENOUGH_PLAYERS', async () => {
    const sb = mockSupabase({
      'rpc:start_game': { data: null, error: { message: 'NOT_ENOUGH_PLAYERS: need 2' } },
    });
    await expect(startGame({ supabase: sb, playerId: 'p1', roomId: 'r1' }))
      .rejects.toMatchObject({ code: 'NOT_ENOUGH_PLAYERS' });
  });
  it('unknown prefix bubbles as INTERNAL', async () => {
    const sb = mockSupabase({
      'rpc:start_game': { data: null, error: { message: 'something else entirely' } },
    });
    await expect(startGame({ supabase: sb, playerId: 'p1', roomId: 'r1' }))
      .rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('submitTurn', () => {
  it('returns advanced=false when more submissions pending', async () => {
    const sb = mockSupabase({
      'rpc:submit_turn': { data: [{ advanced: false, new_phase: 'writing', new_round: 1 }], error: null },
    });
    const r = await submitTurn({ supabase: sb, playerId: 'p1', roomId: 'r1', content: 'code', language: 'python' });
    expect(r).toEqual({ advanced: false, newPhase: 'writing', newRound: 1 });
  });
  it('returns advanced=true on phase transition', async () => {
    const sb = mockSupabase({
      'rpc:submit_turn': { data: [{ advanced: true, new_phase: 'describing', new_round: 2 }], error: null },
    });
    const r = await submitTurn({ supabase: sb, playerId: 'p1', roomId: 'r1', content: 'code', language: 'python' });
    expect(r).toEqual({ advanced: true, newPhase: 'describing', newRound: 2 });
  });
  it('translates INVALID_SUBMIT', async () => {
    const sb = mockSupabase({
      'rpc:submit_turn': { data: null, error: { message: 'INVALID_SUBMIT: already submitted this round' } },
    });
    await expect(
      submitTurn({ supabase: sb, playerId: 'p1', roomId: 'r1', content: 'code', language: 'python' }),
    ).rejects.toMatchObject({ code: 'INVALID_SUBMIT' });
  });
});

describe('resetGame', () => {
  it('returns ok on success', async () => {
    const sb = mockSupabase({ 'rpc:reset_game': { data: [{ ok: true }], error: null } });
    const r = await resetGame({ supabase: sb, playerId: 'p1', roomId: 'r1' });
    expect(r).toEqual({ ok: true });
  });
  it('translates NOT_HOST', async () => {
    const sb = mockSupabase({
      'rpc:reset_game': { data: null, error: { message: 'NOT_HOST: only the host can reset' } },
    });
    await expect(resetGame({ supabase: sb, playerId: 'p1', roomId: 'r1' }))
      .rejects.toMatchObject({ code: 'NOT_HOST' });
  });
});
