-- 023_kick_mid_game.sql
--
-- Allow the host to remove a player mid-game without scrambling chain
-- assignments. The chain math assumes a constant player_count across
-- rounds (chain_idx = ((seat - round) mod N + N) mod N), so a hard
-- DELETE in the middle of a game would re-shuffle every player's
-- chain ownership and break the round-by-round mapping. We therefore
-- soft-delete (set is_active=false) once the game has left the lobby
-- and pre-fill empty submissions for every round the target would
-- have authored, so the chain never stalls waiting on them.
--
-- Lobby kicks continue to hard-delete (no chain to preserve yet).
-- submissions.author_id has ON DELETE CASCADE; a mid-game DELETE would
-- also wipe the already-submitted rounds, which is another reason to
-- prefer the soft path.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION kick_player(
  p_host_id   uuid,
  p_room_id   uuid,
  p_target_id uuid
)
RETURNS TABLE (room_remaining_count int)
LANGUAGE plpgsql AS $$
DECLARE
  v_room_host    uuid;
  v_status       text;
  v_round_count  smallint;
  v_player_count int;
  v_target_seat  smallint;
  v_target_found boolean;
  v_round        int;
  v_chain_idx    int;
  v_round_type   text;
  v_default_lang text;
BEGIN
  -- Lock the room while we validate.
  SELECT rooms.host_id, rooms.status::text, rooms.round_count
    INTO v_room_host, v_status, v_round_count
    FROM rooms WHERE rooms.id = p_room_id FOR UPDATE;

  IF v_room_host IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_room_host != p_host_id THEN
    RAISE EXCEPTION 'NOT_HOST: only the host can kick';
  END IF;
  IF p_target_id = p_host_id THEN
    RAISE EXCEPTION 'INVALID_SUBMIT: host cannot kick themselves';
  END IF;

  -- Look up the target's seat (NULL if they've already been removed or
  -- never had one — e.g. game hasn't started yet).
  SELECT seat_index INTO v_target_seat
    FROM players WHERE id = p_target_id AND room_id = p_room_id;

  v_target_found := FOUND;
  SELECT count(*)::int INTO v_player_count FROM players WHERE room_id = p_room_id;

  IF NOT v_target_found THEN
    -- Already gone — idempotent no-op.
    RETURN QUERY SELECT v_player_count;
    RETURN;
  END IF;

  IF v_status = 'lobby' THEN
    -- Lobby: hard delete, no chains to preserve.
    DELETE FROM players WHERE id = p_target_id;
    SELECT count(*)::int INTO v_player_count FROM players WHERE room_id = p_room_id;
    RETURN QUERY SELECT v_player_count;
    RETURN;
  END IF;

  -- In-game: soft-delete and pre-fill the kicked player's outstanding
  -- submissions across every round so other players can keep going.
  UPDATE players SET is_active = false WHERE id = p_target_id;

  IF v_target_seat IS NOT NULL THEN
    FOR v_round IN 1..v_round_count LOOP
      v_chain_idx := ((v_target_seat::int - v_round) % v_player_count + v_player_count) % v_player_count;
      -- Even rounds describe, odd rounds (incl. round 1) code — same as flush_phase.
      IF v_round % 2 = 0 THEN
        v_round_type := 'describe';
        v_default_lang := NULL;
      ELSE
        v_round_type := 'code';
        v_default_lang := 'python';
      END IF;
      INSERT INTO submissions
        (room_id, round_num, chain_index, author_id, round_type, content, language)
      VALUES
        (p_room_id, v_round::smallint, v_chain_idx::smallint, p_target_id,
         v_round_type, '', v_default_lang)
      ON CONFLICT (room_id, round_num, chain_index) DO NOTHING;
    END LOOP;
  END IF;

  -- player_count stays the same — soft-delete keeps the row.
  RETURN QUERY SELECT v_player_count;
END $$;

REVOKE EXECUTE ON FUNCTION kick_player(uuid, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION kick_player(uuid, uuid, uuid) TO service_role;
