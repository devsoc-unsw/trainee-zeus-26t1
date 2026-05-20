-- 007_leave_room_proc.sql
-- Atomic "player leaves room" — required to be transactional because if
-- the leaving player is the host, we also have to promote the next-
-- joined player to host AND update rooms.host_id, otherwise concurrent
-- requests can observe an inconsistent state.

CREATE OR REPLACE FUNCTION leave_room(p_player_id uuid, p_room_id uuid)
RETURNS TABLE (host_transferred_to uuid, room_remaining_count int)
LANGUAGE plpgsql AS $$
DECLARE
  v_was_host    boolean;
  v_next_host   uuid;
  v_remaining   int;
BEGIN
  -- Snapshot is_host before deleting.
  SELECT is_host INTO v_was_host
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id;

  IF v_was_host IS NULL THEN
    -- Player either never existed or already left. Idempotent: no-op.
    SELECT count(*)::int INTO v_remaining FROM players WHERE room_id = p_room_id;
    RETURN QUERY SELECT NULL::uuid AS host_transferred_to, v_remaining AS room_remaining_count;
    RETURN;
  END IF;

  DELETE FROM players WHERE id = p_player_id;

  IF v_was_host THEN
    -- Promote the next-joined player (by created_at, ascending).
    SELECT id INTO v_next_host
    FROM players
    WHERE room_id = p_room_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_next_host IS NOT NULL THEN
      UPDATE players SET is_host = true  WHERE id = v_next_host;
      UPDATE rooms   SET host_id = v_next_host WHERE id = p_room_id;
    ELSE
      -- Last player left. Clear host_id; the empty room can be GC'd later.
      UPDATE rooms SET host_id = NULL WHERE id = p_room_id;
    END IF;
  END IF;

  SELECT count(*)::int INTO v_remaining FROM players WHERE room_id = p_room_id;
  RETURN QUERY SELECT v_next_host AS host_transferred_to, v_remaining AS room_remaining_count;
END $$;

-- Only the service-role calls this (route handlers). Anon clients never
-- invoke RPCs in our model.
REVOKE EXECUTE ON FUNCTION leave_room(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION leave_room(uuid, uuid) TO service_role;
