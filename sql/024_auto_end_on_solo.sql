-- 024_auto_end_on_solo.sql
--
-- When a kick or leave drops the active-player count to 1 or 0 during
-- active gameplay, transition straight to the reveal phase. The chain
-- can't continue without enough writers, so we end the game gracefully
-- and let the host either reset ("Play again") or terminate the room.
--
-- Implemented as an AFTER trigger so any future code path that
-- soft-deletes (is_active=false) or hard-deletes a player automatically
-- gets the auto-end behaviour. Note the `UPDATE OF is_active` clause:
-- start_game's bulk seat_index assignment doesn't touch is_active, so
-- the trigger doesn't fire during game start.

CREATE OR REPLACE FUNCTION auto_end_if_solo()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_room_id uuid;
  v_status  text;
  v_phase   text;
  v_active  int;
BEGIN
  v_room_id := COALESCE(NEW.room_id, OLD.room_id);

  SELECT status::text, phase
    INTO v_status, v_phase
    FROM rooms WHERE id = v_room_id;

  -- Only intervene during active gameplay; lobby and post-reveal are
  -- left alone so we don't accidentally end a one-host lobby.
  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF v_phase IN ('reveal', 'ended') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*)::int INTO v_active
    FROM players
    WHERE room_id = v_room_id
      AND COALESCE(is_active, true) = true;

  IF v_active <= 1 THEN
    UPDATE rooms
      SET phase = 'reveal', phase_started_at = now()
      WHERE id = v_room_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS players_auto_end ON players;
CREATE TRIGGER players_auto_end
  AFTER DELETE OR UPDATE OF is_active ON players
  FOR EACH ROW
  EXECUTE FUNCTION auto_end_if_solo();
