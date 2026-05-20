import { describe, it, expect } from 'vitest';
import { GameError, ERROR_CODES } from '../errors';

describe('GameError', () => {
  it('exposes code and message', () => {
    const e = new GameError('ROOM_NOT_FOUND', 'No such room');
    expect(e.code).toBe('ROOM_NOT_FOUND');
    expect(e.message).toBe('No such room');
  });

  it('is an instance of Error', () => {
    const e = new GameError('NAME_TAKEN', 'name in use');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('GameError');
  });

  it('preserves the stack trace', () => {
    const e = new GameError('INTERNAL', 'boom');
    expect(typeof e.stack).toBe('string');
    expect(e.stack).toContain('GameError');
  });
});

describe('ERROR_CODES', () => {
  it('exposes every code the spec lists', () => {
    expect(ERROR_CODES).toEqual({
      ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
      NAME_TAKEN: 'NAME_TAKEN',
      NOT_HOST: 'NOT_HOST',
      NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
      GAME_IN_PROGRESS: 'GAME_IN_PROGRESS',
      INVALID_SUBMIT: 'INVALID_SUBMIT',
      INTERNAL: 'INTERNAL',
    });
  });
});
