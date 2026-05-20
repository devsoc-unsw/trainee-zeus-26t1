-- 010_chain_scores_realtime.sql
-- Add chain_scores to the Realtime publication so the /reveal page can
-- subscribe to score updates as judgeRoom flips status pending → done/failed.
-- Idempotent via the pg_publication_tables check.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chain_scores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chain_scores;
  END IF;
END $$;
