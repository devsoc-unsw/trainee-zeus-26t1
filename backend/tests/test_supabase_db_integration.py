"""
Live Supabase / Postgres checks for game tables and repository helpers.

These tests call your real Supabase project (service role). They are **skipped**
unless you opt in so CI and laptops without credentials stay green.

Run (from `backend/` with venv active):

  export RUN_SUPABASE_DB_TESTS=1
  export SUPABASE_URL='https://<ref>.supabase.co'
  export SUPABASE_SERVICE_ROLE_KEY='<service_role_jwt>'
  pytest tests/test_supabase_db_integration.py -v -m integration

Use the full **service_role** key from **Project Settings → API** (long JWT with two dots).
If the key is truncated, wrong, or not JWT-shaped, the Supabase client will refuse to start.

If inserts fail with RLS or permission errors, ensure `public.rooms` / `public.players`
allow the **service_role** (or disable RLS for these tables while developing). The
schema in `sql/supabase_game_schema.sql` does not enable RLS by default.
"""
from __future__ import annotations

import os
import secrets
import string
import uuid

import pytest

pytestmark = pytest.mark.integration


def _looks_like_jwt(key: str) -> bool:
    """Supabase Python client rejects keys that are not JWT-shaped (three segments)."""
    parts = key.split(".")
    return len(parts) >= 3 and all(len(p) >= 4 for p in parts[:3])


def _credentials_configured() -> bool:
    if os.getenv("RUN_SUPABASE_DB_TESTS", "").strip().lower() not in (
        "1",
        "true",
        "yes",
        "on",
    ):
        return False
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        return False
    low = url.lower()
    if "your-project" in low or "placeholder" in low or "example.supabase" in low:
        return False
    if key.startswith("your-") or "placeholder" in key.lower():
        return False
    if not low.startswith("https://") or ".supabase.co" not in low:
        return False
    if not _looks_like_jwt(key):
        return False
    return True


skip_unless_live = pytest.mark.skipif(
    not _credentials_configured(),
    reason=(
        "Set RUN_SUPABASE_DB_TESTS=1 and export SUPABASE_URL (https://*.supabase.co) "
        "and SUPABASE_SERVICE_ROLE_KEY (full service_role JWT from Project Settings → API)"
    ),
)


def _rand_code() -> str:
    alphabet = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


@pytest.fixture
def sb():
    from supabase._sync.client import SupabaseException

    from app.deps import supabase as supabase_mod
    from app.deps.supabase import get_supabase_client

    supabase_mod.get_supabase_client.cache_clear()
    try:
        return get_supabase_client()
    except ValueError as e:
        pytest.skip(f"Missing Supabase env: {e}")
    except SupabaseException as e:
        pytest.skip(
            "Invalid SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY "
            f"(client refused to start: {e}). "
            "Use the service_role JWT from Supabase → Project Settings → API."
        )


@skip_unless_live
def test_prompts_table_readable(sb):
    res = sb.table("prompts").select("id,text,category").limit(5).execute()
    assert res.data is not None
    assert isinstance(res.data, list)
    if len(res.data) == 0:
        pytest.skip("prompts table is empty; ensure sql/supabase_game_schema.sql seed ran")


@skip_unless_live
def test_repository_room_lifecycle(sb):
    from app.db import game_repository

    room_id = str(uuid.uuid4())
    host_id = str(uuid.uuid4())
    guest_id = str(uuid.uuid4())
    code = _rand_code()

    try:
        game_repository.persist_room_created(room_id, code, host_id, "HostSmoke", 3, None)

        room_row = sb.table("rooms").select("*").eq("id", room_id).limit(1).execute()
        assert len(room_row.data) == 1
        assert room_row.data[0]["code"] == code
        assert room_row.data[0]["host_id"] == host_id
        assert room_row.data[0]["status"] == "lobby"
        assert room_row.data[0]["round_count"] == 3

        host_row = sb.table("players").select("*").eq("id", host_id).limit(1).execute()
        assert len(host_row.data) == 1
        assert host_row.data[0]["name"] == "HostSmoke"
        assert host_row.data[0]["is_host"] is True

        game_repository.persist_player_joined(guest_id, "GuestSmoke", room_id, False, None)
        guest_row = sb.table("players").select("*").eq("id", guest_id).limit(1).execute()
        assert len(guest_row.data) == 1
        assert guest_row.data[0]["name"] == "GuestSmoke"

        game_repository.persist_room_state(room_id, status="active", current_round=0)
        active = sb.table("rooms").select("status,current_round").eq("id", room_id).limit(1).execute()
        assert active.data[0]["status"] == "active"

        game_repository.persist_room_state(room_id, status="over", current_round=3)
        ended = sb.table("rooms").select("status,current_round").eq("id", room_id).limit(1).execute()
        assert ended.data[0]["status"] == "ended"
        assert ended.data[0]["current_round"] == 3

        game_repository.persist_player_deleted(guest_id)
        missing = sb.table("players").select("id").eq("id", guest_id).limit(1).execute()
        assert missing.data == []

        game_repository.persist_room_deleted(room_id)
        rm = sb.table("rooms").select("id").eq("id", room_id).limit(1).execute()
        assert rm.data == []
        hp = sb.table("players").select("id").eq("id", host_id).limit(1).execute()
        assert hp.data == []
    finally:
        try:
            sb.table("players").delete().eq("room_id", room_id).execute()
            sb.table("rooms").delete().eq("id", room_id).execute()
        except Exception:
            pass
