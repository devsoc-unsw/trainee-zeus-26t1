import { describe, it, expect } from 'vitest';
import { roomChannel, playersChannel, submissionsChannel, chainScoresChannel } from '../channels';

describe('channel name helpers', () => {
  it('roomChannel encodes the room id', () => {
    expect(roomChannel('abc-123')).toBe('room:abc-123');
  });
  it('playersChannel encodes the room id', () => {
    expect(playersChannel('abc-123')).toBe('players:abc-123');
  });
  it('submissionsChannel encodes the room id', () => {
    expect(submissionsChannel('abc-123')).toBe('submissions:abc-123');
  });
  it('chainScoresChannel encodes the room id', () => {
    expect(chainScoresChannel('abc-123')).toBe('chain_scores:abc-123');
  });
});
