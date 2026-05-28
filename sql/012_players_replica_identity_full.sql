-- 012_players_replica_identity_full.sql
--
-- By default Postgres only writes the primary key into the WAL on
-- DELETE, so Supabase Realtime's DELETE payload for `players` only
-- contains `id`. The browser's useRoom hook subscribes with the filter
-- `room_id=eq.<roomId>`, which then matches nothing on DELETE and the
-- kicked player stays in the host's list until a manual refresh.
--
-- Setting REPLICA IDENTITY FULL writes every column to the WAL, so the
-- DELETE payload includes `room_id` and the filter matches.
--
-- Storage cost: marginal. The `players` table is tiny (≤6 rows per
-- room, short-lived).

ALTER TABLE players REPLICA IDENTITY FULL;
