-- 011_kick_player.sql
--
-- Host kicks another player out of the lobby. Lobby-only — once the
-- game starts, removing a player would break chain assignments, so this
-- RPC refuses to run unless rooms.status = 'lobby'.

CREATE OR REPLACE FUNCTION kick_player(
  p_host_id   uuid,
  p_room_id   uuid,
  p_target_id uuid
)
RETURNS TABLE (room_remaining_count int)
LANGUAGE plpgsql AS $$
DECLARE
  v_room_host  uuid;
  v_status     text;
  v_target_row players%ROWTYPE;
  v_remaining  int;
BEGIN
  -- Lock the room while we validate so a concurrent start_game can't
  -- race us past the lobby check.
  SELECT rooms.host_id, rooms.status::text
    INTO v_room_host, v_status
    FROM rooms WHERE rooms.id = p_room_id FOR UPDATE;

  IF v_room_host IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_room_host != p_host_id THEN
    RAISE EXCEPTION 'NOT_HOST: only the host can kick';
  END IF;
  IF v_status != 'lobby' THEN
    RAISE EXCEPTION 'GAME_IN_PROGRESS: cannot kick once the game has started';
  END IF;
  IF p_target_id = p_host_id THEN
    RAISE EXCEPTION 'INVALID_SUBMIT: host cannot kick themselves';
  END IF;

  SELECT * INTO v_target_row
    FROM players WHERE id = p_target_id AND room_id = p_room_id;

  IF v_target_row.id IS NULL THEN
    -- Target already left or wrong room — idempotent no-op.
    SELECT count(*)::int INTO v_remaining FROM players WHERE room_id = p_room_id;
    RETURN QUERY SELECT v_remaining AS room_remaining_count;
    RETURN;
  END IF;

  DELETE FROM players WHERE id = p_target_id;

  SELECT count(*)::int INTO v_remaining FROM players WHERE room_id = p_room_id;
  RETURN QUERY SELECT v_remaining AS room_remaining_count;
END $$;

REVOKE EXECUTE ON FUNCTION kick_player(uuid, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION kick_player(uuid, uuid, uuid) TO service_role;
