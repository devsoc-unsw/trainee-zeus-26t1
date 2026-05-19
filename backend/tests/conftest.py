"""Shared fixtures for backend game/scoring tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.game.room import Player, Room, Submission, new_id


def make_three_player_room(*, with_submissions: bool = True) -> Room:
    """Lobby-ready room with three players in rotation order."""
    p1, p2, p3 = new_id(), new_id(), new_id()
    room = Room(
        id=new_id(),
        code="TST001",
        host_id=p1,
        players={
            p1: Player(id=p1, name="Jordan", is_host=True),
            p2: Player(id=p2, name="Amrita", is_host=False),
            p3: Player(id=p3, name="Lukas", is_host=False),
        },
        player_order=[p1, p2, p3],
        status="active",
        round_count=3,
        rotation_order=[p1, p2, p3],
        current_round=3,
        prompt_text="Reverse a string",
    )
    if with_submissions:
        room.submissions = {
            1: {
                p1: Submission(
                    "def reverse_string(s):\n    return s[::-1]\n",
                    language="python",
                ),
                p2: Submission("Takes a string and returns it reversed."),
                p3: Submission("unused r1", language="python"),
            },
            2: {
                p1: Submission("unused r2a"),
                p2: Submission("Reverses characters in a string."),
                p3: Submission("unused r2b"),
            },
            3: {
                p1: Submission("unused r3a", language="python"),
                p2: Submission("Same description pass-through."),
                p3: Submission(
                    "def flip(text):\n    return text[::-1]\n",
                    language="javascript",
                ),
            },
        }
    return room


@pytest.fixture
def completed_room():
    return make_three_player_room(with_submissions=True)


@pytest.fixture
def game_client(monkeypatch):
    """FastAPI test client with a fresh in-memory game hub."""
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")
    from app.game.manager import hub

    hub.reset_for_tests()
    from app.main import app

    with TestClient(app) as client:
        yield client
    hub.reset_for_tests()
