"""Unit tests for game_repository (mocked Supabase client)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.db import game_repository


@pytest.fixture
def mock_sb():
    """Return a client whose .table(name) yields an isolated chain per table."""

    def make_chain() -> MagicMock:
        c = MagicMock()
        c.insert.return_value = c
        c.update.return_value = c
        c.delete.return_value = c
        c.eq.return_value = c
        c.execute.return_value = MagicMock(data=[])
        return c

    chains: dict[str, MagicMock] = {}
    sb = MagicMock()

    def _table(name: str) -> MagicMock:
        if name not in chains:
            chains[name] = make_chain()
        return chains[name]

    sb.table.side_effect = _table
    sb._chains = chains  # type: ignore[attr-defined]
    return sb


def test_persist_room_created_calls_supabase(mock_sb):
    with patch.object(game_repository, "_client", return_value=mock_sb):
        game_repository.persist_room_created(
            "00000000-0000-0000-0000-000000000001",
            "ABCDEF",
            "00000000-0000-0000-0000-000000000002",
            "Host",
            5,
            None,
        )
    rooms = mock_sb._chains["rooms"]
    players = mock_sb._chains["players"]
    assert rooms.insert.call_count == 1
    assert players.insert.call_count == 1
    assert rooms.update.call_count == 1
    ins_room = rooms.insert.call_args[0][0]
    assert ins_room["id"] == "00000000-0000-0000-0000-000000000001"
    assert ins_room["code"] == "ABCDEF"
    assert ins_room["round_count"] == 5
    assert ins_room["host_id"] is None


def test_no_client_skips(mock_sb):
    with patch.object(game_repository, "_client", return_value=None):
        game_repository.persist_player_deleted("x")
    mock_sb.table.assert_not_called()


def test_client_returns_none_when_supabase_rejects_api_key():
    from supabase._sync.client import SupabaseException

    with patch(
        "app.deps.supabase.get_supabase_client",
        side_effect=SupabaseException("Invalid API key"),
    ):
        assert game_repository._client() is None

    game_repository.persist_room_created(
        "00000000-0000-0000-0000-000000000001",
        "ABC123",
        "00000000-0000-0000-0000-000000000002",
        "Host",
        3,
        None,
    )


def test_persist_room_state_maps_over_to_ended(mock_sb):
    with patch.object(game_repository, "_client", return_value=mock_sb):
        game_repository.persist_room_state(
            "00000000-0000-0000-0000-000000000099",
            status="over",
            current_round=3,
        )
    rooms = mock_sb._chains["rooms"]
    rooms.update.assert_called_once()
    payload = rooms.update.call_args[0][0]
    assert payload["status"] == "ended"
    assert payload["current_round"] == 3


def test_persist_room_state_active_unchanged(mock_sb):
    with patch.object(game_repository, "_client", return_value=mock_sb):
        game_repository.persist_room_state(
            "00000000-0000-0000-0000-000000000099",
            status="active",
            current_round=2,
        )
    payload = mock_sb._chains["rooms"].update.call_args[0][0]
    assert payload["status"] == "active"


def test_persist_player_joined_payload(mock_sb):
    with patch.object(game_repository, "_client", return_value=mock_sb):
        game_repository.persist_player_joined(
            "00000000-0000-0000-0000-0000000000aa",
            "Guest",
            "00000000-0000-0000-0000-000000000001",
            False,
            None,
        )
    row = mock_sb._chains["players"].insert.call_args[0][0]
    assert row["name"] == "Guest"
    assert row["is_host"] is False
    assert row["room_id"] == "00000000-0000-0000-0000-000000000001"


def test_persist_room_host_updates_players(mock_sb):
    with patch.object(game_repository, "_client", return_value=mock_sb):
        game_repository.persist_room_host(
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-0000000000bb",
        )
    rooms = mock_sb._chains["rooms"]
    players = mock_sb._chains["players"]
    assert rooms.update.call_count == 1
    assert players.update.call_count == 2


def test_persist_player_deleted_and_room_deleted(mock_sb):
    with patch.object(game_repository, "_client", return_value=mock_sb):
        game_repository.persist_player_deleted("pid")
        game_repository.persist_room_deleted("rid")
    mock_sb._chains["players"].delete.assert_called_once()
    mock_sb._chains["rooms"].delete.assert_called_once()
