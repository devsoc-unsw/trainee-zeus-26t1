-- 020_phase_duration.sql
--
-- Wire up the "Round timing" lobby radio so it actually changes the
-- per-phase timer. Previously the radio was cosmetic — local state only.
--
-- Adds rooms.phase_duration_seconds (default 180s = 3 min "normal") and
-- extends update_room_settings to accept it.

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS phase_duration_seconds integer NOT NULL DEFAULT 180;

CREATE OR REPLACE FUNCTION update_room_settings(
  p_host_id                 uuid,
  p_room_id                 uuid,
  p_prompts_enabled         boolean DEFAULT NULL,
  p_phase_duration_seconds  integer DEFAULT NULL
)
RETURNS TABLE(prompts_enabled boolean, phase_duration_seconds integer)
LANGUAGE plpgsql AS $$
DECLARE
  v_host_id  uuid;
  v_status   text;
  v_prompts  boolean;
  v_duration integer;
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

  -- Range-clamp duration to a sane window (30s..600s).
  IF p_phase_duration_seconds IS NOT NULL THEN
    IF p_phase_duration_seconds < 30 OR p_phase_duration_seconds > 600 THEN
      RAISE EXCEPTION 'INVALID_SUBMIT: phase_duration_seconds must be 30..600';
    END IF;
  END IF;

  UPDATE rooms
    SET prompts_enabled        = COALESCE(p_prompts_enabled, prompts_enabled),
        phase_duration_seconds = COALESCE(p_phase_duration_seconds, phase_duration_seconds)
    WHERE id = p_room_id
    RETURNING rooms.prompts_enabled, rooms.phase_duration_seconds
    INTO v_prompts, v_duration;

  RETURN QUERY SELECT v_prompts AS prompts_enabled, v_duration AS phase_duration_seconds;
END $$;

REVOKE EXECUTE ON FUNCTION update_room_settings(uuid, uuid, boolean, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION update_room_settings(uuid, uuid, boolean, integer) TO service_role;

-- Drop the old 3-arg version that no longer matches the callsite.
DROP FUNCTION IF EXISTS update_room_settings(uuid, uuid, boolean);
