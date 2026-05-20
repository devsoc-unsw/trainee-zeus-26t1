import { describe, it, expect } from 'vitest';
import { chainForPlayer, phaseForRound } from '../seating';

describe('chainForPlayer', () => {
  it('round 0 has chain == seat (the seed row)', () => {
    expect(chainForPlayer(0, 0, 3)).toBe(0);
    expect(chainForPlayer(1, 0, 3)).toBe(1);
    expect(chainForPlayer(2, 0, 3)).toBe(2);
  });
  it('round 1 shifts by -1 mod N', () => {
    expect(chainForPlayer(0, 1, 3)).toBe(2);
    expect(chainForPlayer(1, 1, 3)).toBe(0);
    expect(chainForPlayer(2, 1, 3)).toBe(1);
  });
  it('round equal to N wraps back to seat (full rotation)', () => {
    expect(chainForPlayer(0, 3, 3)).toBe(0);
    expect(chainForPlayer(2, 5, 5)).toBe(2);
  });
  it('handles seat 0 in round greater than N (double wrap)', () => {
    expect(chainForPlayer(0, 7, 3)).toBe(2);
  });
});

describe('phaseForRound', () => {
  it('round 1 is writing', () => {
    expect(phaseForRound(1, 3)).toBe('writing');
    expect(phaseForRound(1, 5)).toBe('writing');
  });
  it('even rounds (>=2) are describing', () => {
    expect(phaseForRound(2, 3)).toBe('describing');
    expect(phaseForRound(4, 5)).toBe('describing');
  });
  it('odd rounds (>=3) are reimplementing', () => {
    expect(phaseForRound(3, 3)).toBe('reimplementing');
    expect(phaseForRound(5, 5)).toBe('reimplementing');
  });
  it('round greater than round_count is reveal', () => {
    expect(phaseForRound(4, 3)).toBe('reveal');
    expect(phaseForRound(6, 5)).toBe('reveal');
  });
});
