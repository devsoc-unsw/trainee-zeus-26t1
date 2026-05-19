"""
Persist game lobby / room metadata to Supabase (Postgres).

In-memory WebSocket state remains authoritative for realtime play; these calls
best-effort mirror lifecycle events for analytics and recovery. If env vars or
DB schema are missing, operations no-op after logging at DEBUG.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def _client() -> Any | None:
    try:
        from app.deps.supabase import get_supabase_client
        from supabase._sync.client import SupabaseException

        return get_supabase_client()
    except ValueError:
        logger.debug("Supabase client unavailable (env not set)")
        return None
    except SupabaseException:
        logger.warning(
            "Supabase client unavailable (invalid SUPABASE_URL or "
            "SUPABASE_SERVICE_ROLE_KEY); persistence disabled",
            exc_info=True,
        )
        return None


def _app_status_to_pg(status: str) -> str:
    """Map in-memory GameHub status to Postgres room_status enum."""
    if status == "over":
        return "ended"
    if status == "active":
        return "active"
    return "lobby"


def _socket_key(ws: Any | None) -> str | None:
    if ws is None:
        return None
    return f"{id(ws):x}"[:64]


def persist_room_created(
    room_id: str,
    code: str,
    host_player_id: str,
    host_name: str,
    round_count: int,
    ws: Any | None,
) -> None:
    sb = _client()
    if not sb:
        return
    sk = _socket_key(ws)
    try:
        sb.table("rooms").insert(
            {
                "id": room_id,
                "code": code,
                "status": "lobby",
                "game_mode": "classic",
                "current_round": 0,
                "host_id": None,
                "round_count": round_count,
            }
        ).execute()
        sb.table("players").insert(
            {
                "id": host_player_id,
                "name": host_name[:32],
                "room_id": room_id,
                "is_host": True,
                "socket_id": sk,
            }
        ).execute()
        sb.table("rooms").update({"host_id": host_player_id}).eq("id", room_id).execute()
    except Exception:
        logger.warning("persist_room_created failed", exc_info=True)


def persist_player_joined(
    player_id: str,
    name: str,
    room_id: str,
    is_host: bool,
    ws: Any | None,
) -> None:
    sb = _client()
    if not sb:
        return
    try:
        sb.table("players").insert(
            {
                "id": player_id,
                "name": name[:32],
                "room_id": room_id,
                "is_host": is_host,
                "socket_id": _socket_key(ws),
            }
        ).execute()
    except Exception:
        logger.warning("persist_player_joined failed", exc_info=True)


def persist_player_socket(player_id: str, ws: Any | None) -> None:
    sb = _client()
    if not sb:
        return
    try:
        sb.table("players").update({"socket_id": _socket_key(ws)}).eq("id", player_id).execute()
    except Exception:
        logger.warning("persist_player_socket failed", exc_info=True)


def persist_room_host(room_id: str, host_player_id: str) -> None:
    sb = _client()
    if not sb:
        return
    try:
        sb.table("rooms").update({"host_id": host_player_id}).eq("id", room_id).execute()
        sb.table("players").update({"is_host": False}).eq("room_id", room_id).execute()
        sb.table("players").update({"is_host": True}).eq("id", host_player_id).execute()
    except Exception:
        logger.warning("persist_room_host failed", exc_info=True)


def persist_player_deleted(player_id: str) -> None:
    sb = _client()
    if not sb:
        return
    try:
        sb.table("players").delete().eq("id", player_id).execute()
    except Exception:
        logger.warning("persist_player_deleted failed", exc_info=True)


def persist_room_deleted(room_id: str) -> None:
    sb = _client()
    if not sb:
        return
    try:
        sb.table("rooms").delete().eq("id", room_id).execute()
    except Exception:
        logger.warning("persist_room_deleted failed", exc_info=True)


def persist_room_state(
    room_id: str,
    *,
    status: str,
    current_round: int,
    host_id: str | None = None,
) -> None:
    sb = _client()
    if not sb:
        return
    payload: dict[str, Any] = {
        "status": _app_status_to_pg(status),
        "current_round": current_round,
    }
    if host_id is not None:
        payload["host_id"] = host_id
    try:
        sb.table("rooms").update(payload).eq("id", room_id).execute()
    except Exception:
        logger.warning("persist_room_state failed", exc_info=True)


def persist_game_completed(
    game_id: str,
    room_id: str,
    round_count: int,
    chain_scores: list[dict[str, Any]] | None,
) -> None:
    """Insert one row into `games` and one row per chain into `game_scores`.

    If `chain_scores` is None (AI scoring not yet implemented or failed),
    the game row is still inserted with no `game_scores` rows — we know
    the game finished even without scores.

    `chain_scores` row shape (when not None):
        {"chain_index": int, "start_player_id": str | None,
         "overall_score": float, "notes": str | None}

    Best-effort — never raises. See spec
    docs/superpowers/specs/2026-05-16-elo-scoring-persistence-stubs.md.
    """
    sb = _client()
    if not sb:
        return
    # TODO: implement
    # - INSERT INTO games (id, room_id, round_count) VALUES (...)
    # - if chain_scores: bulk INSERT INTO game_scores (...) for each row
    # - consider an RPC for atomicity (audit notes recommend this)
    logger.debug("persist_game_completed stub: %s", game_id)


def persist_elo_updates(
    game_id: str,
    updates: list[dict[str, Any]],
) -> None:
    """Apply per-user ELO updates: update users.elo and append elo_history rows.

    `updates` row shape:
        {"user_id": str, "before": int, "after": int, "delta": int}

    Best-effort — never raises.
    """
    sb = _client()
    if not sb:
        return
    # TODO: implement
    # - for each update: UPDATE users SET elo = after, games_played = games_played + 1
    # - INSERT INTO elo_history (user_id, game_id, elo_before, elo_after, delta) VALUES (...)
    # - prefer an RPC for atomicity
    logger.debug("persist_elo_updates stub: %s updates for game %s", len(updates), game_id)


def get_user_elo(user_id: str) -> int | None:
    """Read current ELO from users.elo.

    Returns None if the user is not found OR if the DB is unavailable.
    Best-effort — never raises.
    """
    sb = _client()
    if not sb:
        return None
    try:
        # TODO: implement
        # - SELECT elo FROM users WHERE id = user_id LIMIT 1
        # - return row["elo"] if found, else None
        return None
    except Exception:  # noqa: BLE001
        logger.warning("get_user_elo failed", exc_info=True)
        return None
