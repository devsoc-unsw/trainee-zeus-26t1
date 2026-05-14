-- Add round_count to rooms (run after supabase_game_schema.sql if the column is missing).
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS round_count smallint NOT NULL DEFAULT 3;
