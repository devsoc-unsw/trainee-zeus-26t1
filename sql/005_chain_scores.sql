-- 005_chain_scores.sql
-- Per-chain AI judge results. Streams in via Realtime as the judge completes
-- each chain. Folded into game_scores from 003_scoring_and_elo.sql later,
-- once accounts come back into scope.

CREATE TABLE IF NOT EXISTS chain_scores (
  room_id       uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  chain_index   smallint NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'failed')),
  overall_score real,
  notes         text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, chain_index)
);
