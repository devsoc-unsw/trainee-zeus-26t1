-- 018_terminate_room.sql
--
-- Host-initiated full room teardown. Deletes the room (CASCADE removes
-- players via the existing FK from sql/001). Submissions reference the
-- room via room_id; deleted explicitly here in case the FK isn't ON
-- DELETE CASCADE.

CREATE OR REPLACE FUNCTION terminate_room(p_host_id uuid, p_room_id uuid)
RETURNS TABLE (terminated bool)
LANGUAGE plpgsql AS $$
DECLARE
  v_host_id uuid;
BEGIN
  SELECT rooms.host_id INTO v_host_id
    FROM rooms WHERE rooms.id = p_room_id FOR UPDATE;

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: no such room';
  END IF;
  IF v_host_id != p_host_id THEN
    RAISE EXCEPTION 'NOT_HOST: only the host can terminate the room';
  END IF;

  DELETE FROM submissions WHERE room_id = p_room_id;
  DELETE FROM rooms WHERE id = p_room_id;

  RETURN QUERY SELECT true AS terminated;
END $$;

REVOKE EXECUTE ON FUNCTION terminate_room(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION terminate_room(uuid, uuid) TO service_role;
