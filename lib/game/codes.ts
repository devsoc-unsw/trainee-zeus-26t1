import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateRoomCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

export function isValidRoomCode(code: string): boolean {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code);
}
