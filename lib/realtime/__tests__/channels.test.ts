import { describe, it, expect } from 'vitest';
import { roomChannel, playersChannel } from '../channels';

describe('channel name helpers', () => {
  it('roomChannel encodes the room id', () => {
    expect(roomChannel('abc-123')).toBe('room:abc-123');
  });
  it('playersChannel encodes the room id', () => {
    expect(playersChannel('abc-123')).toBe('players:abc-123');
  });
});
