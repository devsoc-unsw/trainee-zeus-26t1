import { describe, it, expect } from 'vitest';
import { generateRoomCode, isValidRoomCode } from '../codes';

describe('generateRoomCode', () => {
  it('returns 6-char uppercase alphanumeric', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateRoomCode();
      expect(c).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it('returns varied output (very loose check)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 200; i++) set.add(generateRoomCode());
    // With 36^6 space and 200 samples, collisions should be essentially zero.
    expect(set.size).toBeGreaterThanOrEqual(199);
  });
});

describe('isValidRoomCode', () => {
  it('accepts uppercase 6-char alphanumeric', () => {
    expect(isValidRoomCode('ABCD12')).toBe(true);
    expect(isValidRoomCode('ZZZZZZ')).toBe(true);
    expect(isValidRoomCode('000000')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidRoomCode('ABCDE')).toBe(false);
    expect(isValidRoomCode('ABCDEFG')).toBe(false);
    expect(isValidRoomCode('')).toBe(false);
  });

  it('rejects lowercase, symbols, whitespace', () => {
    expect(isValidRoomCode('abcd12')).toBe(false);
    expect(isValidRoomCode('ABCD-1')).toBe(false);
    expect(isValidRoomCode('ABC D1')).toBe(false);
  });
});
