// Channel-name helpers. Each browser opens at most one channel per
// (table, roomId) pair so we don't fan-out beyond what's necessary.

export function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}

export function playersChannel(roomId: string): string {
  return `players:${roomId}`;
}
