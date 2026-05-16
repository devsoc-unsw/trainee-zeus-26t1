-- 003_scoring_and_elo.sql
-- Adds long-lived user identity, completed-game records, per-chain scores,
-- and ELO history. Run AFTER supabase_game_schema.sql and 002_rooms_round_count.sql.
-- All changes are additive; the only existing table touched is `players`,
-- which gains a nullable user_id column.

-- Long-lived user identity. Anonymous for now (no auth provider link);
-- teammate decides whether to backfill from Supabase Auth later.
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name varchar(32) NOT NULL,
  elo integer NOT NULL DEFAULT 1000,
  games_played integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Link ephemeral lobby players → long-lived users. Nullable so anonymous
-- play still works (no ELO impact when null).
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS players_user_id_idx ON players(user_id);

-- Completed game records (separate from `rooms`, which can be recycled).
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  round_count smallint NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now()
);

-- One row per chain in a completed game.
CREATE TABLE IF NOT EXISTS game_scores (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  chain_index smallint NOT NULL,
  start_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  overall_score real NOT NULL,
  notes text,
  PRIMARY KEY (game_id, chain_index)
);

-- Append-only ELO log. Mirrors updates to users.elo.
-- user_id CASCADE: account-deletion semantics (history goes with the user).
-- game_id RESTRICT: protects the audit-log invariant (can't delete a game
-- that has ELO history without an explicit cleanup step).
CREATE TABLE IF NOT EXISTS elo_history (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  elo_before integer NOT NULL,
  elo_after integer NOT NULL,
  delta integer NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS elo_history_user_idx ON elo_history(user_id, ts DESC);
