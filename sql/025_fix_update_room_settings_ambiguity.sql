-- 025_fix_update_room_settings_ambiguity.sql
--
-- Migration 020's update_room_settings declared an OUT column named
-- prompts_enabled (via RETURNS TABLE) and then used a bare
-- `prompts_enabled` inside COALESCE in the UPDATE … SET clause. Postgres
-- couldn't tell whether the bare name referred to the OUT parameter or
-- the table column, so every call failed with:
--
--   ERROR: column reference "prompts_enabled" is ambiguous
--
-- (Same for phase_duration_seconds.) This migration redefines the
-- function with both references explicitly qualified as `rooms.<col>`.
-- Behaviour is otherwise unchanged.

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
    SET prompts_enabled        = COALESCE(p_prompts_enabled, rooms.prompts_enabled),
        phase_duration_seconds = COALESCE(p_phase_duration_seconds, rooms.phase_duration_seconds)
    WHERE rooms.id = p_room_id
    RETURNING rooms.prompts_enabled, rooms.phase_duration_seconds
    INTO v_prompts, v_duration;

  RETURN QUERY SELECT v_prompts AS prompts_enabled, v_duration AS phase_duration_seconds;
END $$;

REVOKE EXECUTE ON FUNCTION update_room_settings(uuid, uuid, boolean, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION update_room_settings(uuid, uuid, boolean, integer) TO service_role;
