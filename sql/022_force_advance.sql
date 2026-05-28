-- 022_force_advance.sql
--
-- Host-initiated "skip the rest of this phase" — two RPCs that combine
-- to let online players auto-submit their drafts (via the existing
-- timer-expiry path) and then flush empty submissions for anyone who
-- still hasn't submitted (closed tabs / disconnects).
--
-- Orchestration lives in the API route at app/api/rooms/[code]/force-
-- advance/route.ts: it captures the current round, calls
-- force_advance_timer, waits ~5s for clients to react, then calls
-- flush_phase with the captured round.

------------------------------------------------------------------------
-- force_advance_timer — shifts phase_started_at into the past so every
-- client's usePhaseTimer recomputes secondsLeft=0 → auto-submit fires.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION force_advance_timer(p_host_id uuid, p_room_id uuid)
RETURNS TABLE (current_round smallint)
LANGUAGE plpgsql AS $$
DECLARE
  v_host_id   uuid;
  v_phase     text;
  v_round     smallint;
  v_duration  integer;
BEGIN
  SELECT host_id, phase, rooms.current_round, phase_duration_seconds
    INTO v_host_id, v_phase, v_round, v_duration
    FROM rooms WHERE id = p_room_id FOR UPDATE;

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_host_id != p_host_id THEN
    RAISE EXCEPTION 'NOT_HOST: only the host can force advance';
  END IF;
  IF v_phase NOT IN ('writing','describing','reimplementing') THEN
    RAISE EXCEPTION 'INVALID_SUBMIT: not in a gameplay phase';
  END IF;

  UPDATE rooms
    SET phase_started_at = now() - (v_duration * INTERVAL '1 second')
    WHERE id = p_room_id;

  RETURN QUERY SELECT v_round AS current_round;
END $$;

REVOKE EXECUTE ON FUNCTION force_advance_timer(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION force_advance_timer(uuid, uuid) TO service_role;

------------------------------------------------------------------------
-- flush_phase — for any player without a submission for the expected
-- round, insert an empty submission, then advance the phase.
-- Idempotent: if the room's current_round has already moved past
-- p_expected_round (because everyone submitted naturally during the
-- grace period), the function returns advanced=false and does nothing.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION flush_phase(
  p_host_id        uuid,
  p_room_id        uuid,
  p_expected_round smallint
)
RETURNS TABLE (new_phase text, new_round smallint, advanced bool)
LANGUAGE plpgsql AS $$
DECLARE
  v_host_id      uuid;
  v_phase        text;
  v_current      smallint;
  v_round_count  smallint;
  v_player_count int;
  v_round_type   text;
  v_default_lang text;
  v_next_round   smallint;
  v_next_phase   text;
BEGIN
  SELECT host_id, phase, current_round, round_count
    INTO v_host_id, v_phase, v_current, v_round_count
    FROM rooms WHERE id = p_room_id FOR UPDATE;

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_host_id != p_host_id THEN
    RAISE EXCEPTION 'NOT_HOST: only the host can flush';
  END IF;

  -- Idempotency: if the round we wanted to flush has already moved on,
  -- bail. This happens when all players submitted during the grace gap.
  IF v_current != p_expected_round
     OR v_phase NOT IN ('writing','describing','reimplementing') THEN
    RETURN QUERY SELECT v_phase, v_current, false;
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_player_count FROM players WHERE room_id = p_room_id;

  IF v_phase = 'describing' THEN
    v_round_type := 'describe';
    v_default_lang := NULL;
  ELSE
    v_round_type := 'code';
    v_default_lang := 'python';
  END IF;

  -- Empty submissions for players who haven't submitted yet.
  WITH missing AS (
    SELECT p.id AS player_id,
           ((p.seat_index::int - v_current::int) % v_player_count + v_player_count) % v_player_count AS chain_idx
      FROM players p
     WHERE p.room_id = p_room_id
       AND p.seat_index IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM submissions s
          WHERE s.room_id = p_room_id
            AND s.round_num = v_current
            AND s.author_id = p.id
       )
  )
  INSERT INTO submissions (room_id, round_num, chain_index, author_id, round_type, content, language)
  SELECT p_room_id, v_current, m.chain_idx::smallint, m.player_id, v_round_type, '', v_default_lang
    FROM missing m
  ON CONFLICT (room_id, round_num, chain_index) DO NOTHING;

  -- Advance phase using submit_turn's logic.
  v_next_round := (v_current + 1)::smallint;
  IF v_next_round > v_round_count THEN
    v_next_phase := 'reveal';
    UPDATE rooms SET phase = v_next_phase, phase_started_at = now() WHERE id = p_room_id;
    RETURN QUERY SELECT v_next_phase, v_current, true;
  ELSE
    v_next_phase := CASE
      WHEN v_next_round = 1 THEN 'writing'
      WHEN v_next_round % 2 = 0 THEN 'describing'
      ELSE 'reimplementing'
    END;
    UPDATE rooms
      SET phase = v_next_phase, current_round = v_next_round, phase_started_at = now()
      WHERE id = p_room_id;
    RETURN QUERY SELECT v_next_phase, v_next_round, true;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION flush_phase(uuid, uuid, smallint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION flush_phase(uuid, uuid, smallint) TO service_role;
