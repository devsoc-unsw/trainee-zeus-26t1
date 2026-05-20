export const ERROR_CODES = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  NAME_TAKEN: 'NAME_TAKEN',
  NOT_HOST: 'NOT_HOST',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  GAME_IN_PROGRESS: 'GAME_IN_PROGRESS',
  INVALID_SUBMIT: 'INVALID_SUBMIT',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class GameError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      (Error as { captureStackTrace: (target: object, ctor: Function) => void }).captureStackTrace(this, GameError);
    }
  }
}
