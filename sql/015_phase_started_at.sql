-- 015_phase_started_at.sql
--
-- Add a server-side phase-start timestamp so all clients see the same
-- countdown. The frontend computes remaining seconds from
-- (phase_started_at + DURATION) - now() and ticks every second.
--
-- Stamped on:
--   * start_game            → lobby → writing (round 1)
--   * submit_turn           → whenever all players have submitted and the
--                             phase advances (writing → describing,
--                             describing → reimplementing, etc.)
--   * reset_game            → back to lobby; the field is reset so the
--                             next game's first phase gets a fresh stamp.
--
-- For rooms created before this migration, the column defaults to now(),
-- which is harmless — those rooms are likely orphans anyway.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS phase_started_at timestamptz NOT NULL DEFAULT now();

------------------------------------------------------------------------
-- start_game — stamp the writing phase
------------------------------------------------------------------------
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

  WITH ordered AS (
    SELECT id, (row_number() OVER (ORDER BY created_at) - 1)::smallint AS seat
      FROM players WHERE room_id = p_room_id
  )
  UPDATE players SET seat_index = ordered.seat
    FROM ordered WHERE players.id = ordered.id;

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
-- submit_turn — stamp the phase on every advance
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_turn(
  p_player_id uuid,
  p_room_id   uuid,
  p_content   text,
  p_language  text DEFAULT NULL
)
RETURNS TABLE(advanced bool, new_phase text, new_round smallint)
LANGUAGE plpgsql AS $$
DECLARE
  v_phase        text;
  v_current      smallint;
  v_round_count  smallint;
  v_seat         smallint;
  v_player_count int;
  v_chain_index  smallint;
  v_round_type   text;
  v_completed    int;
  v_next_round   smallint;
  v_next_phase   text;
BEGIN
  SELECT rooms.phase, rooms.current_round, rooms.round_count
    INTO v_phase, v_current, v_round_count
    FROM rooms WHERE rooms.id = p_room_id FOR UPDATE;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_phase NOT IN ('writing','describing','reimplementing') THEN
    RAISE EXCEPTION 'INVALID_SUBMIT: room is in phase %', v_phase;
  END IF;

  SELECT seat_index INTO v_seat
    FROM players WHERE id = p_player_id AND room_id = p_room_id;
  IF v_seat IS NULL THEN
    RAISE EXCEPTION 'INVALID_SUBMIT: player not seated in this room';
  END IF;

  SELECT count(*)::int INTO v_player_count
    FROM players WHERE room_id = p_room_id;

  v_chain_index := ((v_seat - v_current) % v_player_count + v_player_count) % v_player_count;

  IF v_phase = 'describing' THEN
    v_round_type := 'describe';
    IF p_language IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_SUBMIT: describe phase must not include language';
    END IF;
  ELSE
    v_round_type := 'code';
    IF p_language IS NULL THEN
      RAISE EXCEPTION 'INVALID_SUBMIT: code phase requires a language';
    END IF;
  END IF;

  BEGIN
    INSERT INTO submissions (room_id, round_num, chain_index, author_id, round_type, content, language)
      VALUES (p_room_id, v_current, v_chain_index, p_player_id, v_round_type, p_content, p_language);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'INVALID_SUBMIT: already submitted this round';
  END;

  SELECT count(*)::int INTO v_completed
    FROM submissions WHERE room_id = p_room_id AND round_num = v_current;

  IF v_completed < v_player_count THEN
    RETURN QUERY SELECT false, v_phase, v_current;
    RETURN;
  END IF;

  v_next_round := (v_current + 1)::smallint;
  IF v_next_round > v_round_count THEN
    v_next_phase := 'reveal';
    INSERT INTO chain_scores (room_id, chain_index, status)
      SELECT p_room_id, g::smallint, 'pending'
      FROM generate_series(0, v_player_count - 1) AS g
      ON CONFLICT DO NOTHING;
    UPDATE rooms SET phase = v_next_phase, phase_started_at = now() WHERE id = p_room_id;
    RETURN QUERY SELECT true, v_next_phase, v_current;
  ELSE
    v_next_phase := CASE
      WHEN v_next_round = 1 THEN 'writing'
      WHEN v_next_round % 2 = 0 THEN 'describing'
      ELSE 'reimplementing'
    END;
    UPDATE rooms
      SET phase = v_next_phase,
          current_round = v_next_round,
          phase_started_at = now()
      WHERE id = p_room_id;
    RETURN QUERY SELECT true, v_next_phase, v_next_round;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION submit_turn(uuid, uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION submit_turn(uuid, uuid, text, text) TO service_role;

------------------------------------------------------------------------
-- reset_game — fresh stamp on return to lobby
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_game(p_player_id uuid, p_room_id uuid)
RETURNS TABLE(ok bool)
LANGUAGE plpgsql AS $$
DECLARE
  v_host_id uuid;
BEGIN
  SELECT rooms.host_id INTO v_host_id FROM rooms WHERE rooms.id = p_room_id FOR UPDATE;
  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_host_id != p_player_id THEN
    RAISE EXCEPTION 'NOT_HOST: only the host can reset';
  END IF;

  DELETE FROM submissions  WHERE room_id = p_room_id;
  DELETE FROM chain_scores WHERE room_id = p_room_id;
  UPDATE players SET seat_index = NULL WHERE room_id = p_room_id;
  UPDATE rooms
    SET status = 'lobby',
        phase = 'lobby',
        current_round = 0,
        phase_started_at = now()
    WHERE id = p_room_id;

  RETURN QUERY SELECT true;
END $$;

REVOKE EXECUTE ON FUNCTION reset_game(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION reset_game(uuid, uuid) TO service_role;
