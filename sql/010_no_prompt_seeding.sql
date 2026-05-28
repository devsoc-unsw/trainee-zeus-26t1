-- 010_no_prompt_seeding.sql
--
-- Phase 1 is now free-write: players write whatever they want with no
-- starting prompt. This redefines start_game to drop the prompt-count
-- check and the round-0 INSERT that previously seeded each chain with
-- a random row from the `prompts` table.
--
-- Downstream: the reveal screen now shows round 1 as the first node in
-- the chain. The judge already used round 1 as the "original" code, so
-- AI scoring is unaffected.
--
-- The `prompts` table itself is left in place (dormant) in case we
-- restore a prompt mode later.

CREATE OR REPLACE FUNCTION start_game(p_player_id uuid, p_room_id uuid)
RETURNS TABLE(round_count smallint)
LANGUAGE plpgsql AS $$
DECLARE
  v_host_id      uuid;
  v_status       text;
  v_round_count  smallint;
  v_player_count int;
BEGIN
  SELECT rooms.host_id, rooms.status::text, rooms.round_count
    INTO v_host_id, v_status, v_round_count
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

  -- Assign seat_index by join order.
  WITH ordered AS (
    SELECT id, (row_number() OVER (ORDER BY created_at) - 1)::smallint AS seat
      FROM players WHERE room_id = p_room_id
  )
  UPDATE players SET seat_index = ordered.seat
    FROM ordered WHERE players.id = ordered.id;

  UPDATE rooms SET status = 'active', phase = 'writing', current_round = 1
    WHERE id = p_room_id;

  RETURN QUERY SELECT v_round_count AS round_count;
END $$;

REVOKE EXECUTE ON FUNCTION start_game(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION start_game(uuid, uuid) TO service_role;
