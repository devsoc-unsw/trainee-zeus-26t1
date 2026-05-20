-- 006_rls.sql
-- Enforces the "browser is read-only" invariant in the database, not just
-- by convention. The service-role key bypasses RLS, so Route Handlers
-- still write freely.

-- Enable RLS.
ALTER TABLE rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts        ENABLE ROW LEVEL SECURITY;

-- Anon + authenticated users get SELECT on game tables.
-- No INSERT / UPDATE / DELETE policies → those operations are denied
-- for non-service-role connections.
CREATE POLICY "rooms_select_all"        ON rooms        FOR SELECT USING (true);
CREATE POLICY "players_select_all"      ON players      FOR SELECT USING (true);
CREATE POLICY "submissions_select_all"  ON submissions  FOR SELECT USING (true);
CREATE POLICY "chain_scores_select_all" ON chain_scores FOR SELECT USING (true);
CREATE POLICY "prompts_select_all"      ON prompts      FOR SELECT USING (true);

-- Dormant tables (003_scoring_and_elo.sql): no client access at all.
-- They'll get policies when accounts/ELO come back.
ALTER TABLE IF EXISTS users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS games         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS game_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS elo_history   ENABLE ROW LEVEL SECURITY;
