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

        return get_supabase_client()
    except ValueError:
        logger.debug("Supabase client unavailable (env not set)")
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
