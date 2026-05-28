-- 013_replica_identity_full_remaining.sql
--
-- Same fix as 012, applied to the remaining tables that ship through
-- supabase_realtime. Without REPLICA IDENTITY FULL, DELETE events drop
-- every column except the primary key — and the browser's filters
-- (room_id=eq.X) then never match, so subscribers don't see the row
-- disappear until a manual refresh.
--
-- Affects:
--   * submissions  — reset_game wipes the table; reveal page would
--                    show stale rows until refresh
--   * chain_scores — same, after reset_game
--   * rooms        — not currently deleted, but cheap insurance

ALTER TABLE submissions  REPLICA IDENTITY FULL;
ALTER TABLE chain_scores REPLICA IDENTITY FULL;
ALTER TABLE rooms        REPLICA IDENTITY FULL;
