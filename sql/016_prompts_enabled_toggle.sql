-- 016_prompts_enabled_toggle.sql
--
-- Bring back the optional prompt-seeding feature with a host-controlled
-- toggle. Adds rooms.prompts_enabled (default true). When true, the host
-- starting a game seeds round 0 with one random prompt per chain (the
-- original Plan-3 behaviour). When false, players free-write — chains
-- start from each player's round-1 code (the post-010 behaviour).
--
-- Also widens the seeded prompt set from 5 → 20 rows so a 6-player
-- lobby with prompts_enabled=true doesn't trip the INTERNAL check.
-- Idempotent via ON CONFLICT DO NOTHING on a unique-ish text guard.

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS prompts_enabled boolean NOT NULL DEFAULT true;

------------------------------------------------------------------------
-- Top up the prompts table so a max-6-player lobby can seed.
------------------------------------------------------------------------
INSERT INTO prompts (text, category) VALUES
  ('Write a function that reverses a string in place.', 'algorithm'),
  ('Write a function that finds the longest common prefix in a list of strings.', 'algorithm'),
  ('Write a function that flattens a deeply nested array.', 'algorithm'),
  ('Write a function that returns the nth Fibonacci number.', 'algorithm'),
  ('Write a function that detects whether a linked list has a cycle.', 'algorithm'),
  ('Write a function that determines if two strings are anagrams.', 'algorithm'),
  ('Write a function that performs binary search on a sorted array.', 'algorithm'),
  ('Write a function that groups anagrams together from a list of strings.', 'algorithm'),
  ('Write a function that sorts a list using merge sort.', 'complexity'),
  ('Write a function that finds the kth largest element in an unsorted array.', 'complexity'),
  ('Write a function that returns the shortest path in an unweighted graph.', 'algorithm'),
  ('Write a function that throttles a callback so it fires at most once per N ms.', 'language'),
  ('Write a function that memoises another function.', 'language'),
  ('Write a function that validates a balanced-brackets string.', 'algorithm'),
  ('Write a function that returns all permutations of a list.', 'algorithm')
ON CONFLICT DO NOTHING;

------------------------------------------------------------------------
-- Redefine start_game to honour rooms.prompts_enabled. Keeps the
-- phase_started_at stamp from 015 and the no-fail-without-prompts path
-- from 010.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_game(p_player_id uuid, p_room_id uuid)
RETURNS TABLE(round_count smallint)
LANGUAGE plpgsql AS $$
DECLARE
  v_host_id         uuid;
  v_status          text;
  v_round_count     smallint;
  v_player_count    int;
  v_prompt_count    int;
  v_prompts_enabled boolean;
BEGIN
  SELECT rooms.host_id, rooms.status::text, rooms.round_count, rooms.prompts_enabled
    INTO v_host_id, v_status, v_round_count, v_prompts_enabled
    FROM rooms WHERE rooms.id = p_room_id FOR UPDATE;

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_host_id != p_player_id THEN
    RAISE EXCEPTION 'NOT_HOST: only the host can start';
  END IF;
  IF v_status != 'lobby' THEN
    RAISE EXCEPTION 'GAME_IN_PROGRESS: room is not in lobby';
  END IF;

  SELECT count(*)::int INTO v_player_count
    FROM players WHERE room_id = p_room_id;
  IF v_player_count < 2 THEN
    RAISE EXCEPTION 'NOT_ENOUGH_PLAYERS: need at least 2 players (got %)', v_player_count;
  END IF;

  IF v_prompts_enabled THEN
    SELECT count(*)::int INTO v_prompt_count FROM prompts;
    IF v_prompt_count < v_player_count THEN
      RAISE EXCEPTION 'INTERNAL: only % prompts available for % players', v_prompt_count, v_player_count;
    END IF;
  END IF;

  WITH ordered AS (
    SELECT id, (row_number() OVER (ORDER BY created_at) - 1)::smallint AS seat
      FROM players WHERE room_id = p_room_id
  )
  UPDATE players SET seat_index = ordered.seat
    FROM ordered WHERE players.id = ordered.id;

  IF v_prompts_enabled THEN
    -- Pick N random prompts and seed round 0. round_type='describe'
    -- (prompt text is English, not code), language=NULL.
    WITH picked AS (
      SELECT text, (row_number() OVER (ORDER BY random()) - 1)::smallint AS idx
        FROM prompts ORDER BY random() LIMIT v_player_count
    )
    INSERT INTO submissions (room_id, round_num, chain_index, author_id, round_type, content, language)
    SELECT p_room_id, 0::smallint, picked.idx, NULL, 'describe', picked.text, NULL
      FROM picked;
  END IF;

  UPDATE rooms
    SET status = 'active',
        phase = 'writing',
        current_round = 1,
        phase_started_at = now()
    WHERE id = p_room_id;

  RETURN QUERY SELECT v_round_count AS round_count;
END $$;

REVOKE EXECUTE ON FUNCTION start_game(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION start_game(uuid, uuid) TO service_role;

------------------------------------------------------------------------
-- update_room_settings — host-only, lobby-only setting flip. Used by
-- PATCH /api/rooms/[code]/settings.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_room_settings(
  p_host_id          uuid,
  p_room_id          uuid,
  p_prompts_enabled  boolean
)
RETURNS TABLE(prompts_enabled boolean)
LANGUAGE plpgsql AS $$
DECLARE
  v_host_id  uuid;
  v_status   text;
BEGIN
  SELECT rooms.host_id, rooms.status::text
    INTO v_host_id, v_status
    FROM rooms WHERE rooms.id = p_room_id FOR UPDATE;

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_host_id != p_host_id THEN
    RAISE EXCEPTION 'NOT_HOST: only the host can change room settings';
  END IF;
  IF v_status != 'lobby' THEN
    RAISE EXCEPTION 'GAME_IN_PROGRESS: settings can only change in the lobby';
  END IF;

  UPDATE rooms SET prompts_enabled = p_prompts_enabled WHERE id = p_room_id;

  RETURN QUERY SELECT p_prompts_enabled AS prompts_enabled;
END $$;

REVOKE EXECUTE ON FUNCTION update_room_settings(uuid, uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION update_room_settings(uuid, uuid, boolean) TO service_role;
