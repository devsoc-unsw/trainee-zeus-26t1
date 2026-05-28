-- 017_drop_scoring_and_elo.sql
--
-- Kill the semantic scoring system and the dormant ELO tables.
-- Post-migration the reveal screen is purely chain-visual: no AI judge,
-- no per-chain score, no ELO. The `prompts` table and `prompts_enabled`
-- toggle stay (they're independent of scoring).
--
-- Two RPCs need redefining so they stop referencing chain_scores:
--   * submit_turn   → no longer seeds chain_scores when advancing to reveal
--   * reset_game    → no longer DELETEs from chain_scores

------------------------------------------------------------------------
-- submit_turn (verbatim of 015 minus the chain_scores INSERT)
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
-- reset_game (verbatim of 015 minus the chain_scores DELETE)
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

  DELETE FROM submissions WHERE room_id = p_room_id;
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

------------------------------------------------------------------------
-- Drop the now-unused scoring + ELO tables.
-- CASCADE so any leftover FKs/policies go too. `chain_scores` is also
-- in the supabase_realtime publication; DROP TABLE removes it from there.
------------------------------------------------------------------------
DROP TABLE IF EXISTS chain_scores CASCADE;
DROP TABLE IF EXISTS elo_history CASCADE;
DROP TABLE IF EXISTS game_scores CASCADE;
DROP TABLE IF EXISTS games        CASCADE;
DROP TABLE IF EXISTS users        CASCADE;
