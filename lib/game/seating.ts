export type Phase = 'lobby' | 'writing' | 'describing' | 'reimplementing' | 'reveal' | 'ended';

/**
 * Which chain does this player work on for the given round?
 * Inverse of the spec's `(c + r) mod N → seat` rule.
 */
export function chainForPlayer(seatIndex: number, round: number, playerCount: number): number {
  const n = playerCount;
  return ((seatIndex - round) % n + n) % n;
}

/**
 * Phase pattern:
 *   round 1   → writing
 *   round even (≥2) → describing
 *   round odd  (≥3) → reimplementing
 *   round > round_count → reveal
 */
export function phaseForRound(round: number, roundCount: number): Phase {
  if (round > roundCount) return 'reveal';
  if (round === 1) return 'writing';
  if (round % 2 === 0) return 'describing';
  return 'reimplementing';
}
