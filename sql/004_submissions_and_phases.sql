-- 004_submissions_and_phases.sql
-- Moves the in-memory game state from the old Python manager into Postgres
-- so phase transitions are authoritative and replays become possible later.
-- Run AFTER 001_base_schema.sql, 002_rooms_round_count.sql, 003_scoring_and_elo.sql.

-- ── submissions ───────────────────────────────────────────────────────────────
-- One row per (round, chain) seat. round_num=0 holds the seed prompt
-- (author_id NULL); round_num=1..N holds player work.
CREATE TABLE IF NOT EXISTS submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  round_num     smallint NOT NULL,
  chain_index   smallint NOT NULL,
  author_id     uuid REFERENCES players(id) ON DELETE CASCADE,
  round_type    text NOT NULL CHECK (round_type IN ('code', 'describe')),
  content       text NOT NULL,
  language      text CHECK (language IS NULL OR language IN ('python', 'javascript', 'java')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, round_num, chain_index)
);

CREATE INDEX IF NOT EXISTS submissions_room_idx ON submissions (room_id, round_num);

-- ── rooms.phase / phase_ends_at ───────────────────────────────────────────────
-- Drives the UI directly via Realtime postgres_changes.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'lobby'
    CHECK (phase IN ('lobby', 'writing', 'describing', 'reimplementing', 'reveal', 'ended'));

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS phase_ends_at timestamptz;

-- ── players.seat_index ────────────────────────────────────────────────────────
-- Stable seating order set at game start. NULL while in lobby.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS seat_index smallint;

-- ── players.socket_id (drop) ──────────────────────────────────────────────────
-- No longer needed: Realtime replaces our custom WebSocket protocol.
ALTER TABLE players
  DROP COLUMN IF EXISTS socket_id;
