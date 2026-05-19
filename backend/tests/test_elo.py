"""Unit tests for ELO calculation from AI chain scores."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.game.elo import DEFAULT_ELO, compute_elo_changes
from app.game.manager import GameHub
from app.game.schemas import ChainScore
def test_compute_elo_changes_empty():
    assert compute_elo_changes([]) == []


def test_compute_elo_changes_winner_gains_loser_loses():
    players = [
        {
            "player_id": "a",
            "player_name": "A",
            "current_elo": DEFAULT_ELO,
            "chain_score": 0.95,
        },
        {
            "player_id": "b",
            "player_name": "B",
            "current_elo": DEFAULT_ELO,
            "chain_score": 0.2,
        },
    ]
    result = compute_elo_changes(players)
    by_id = {r["player_id"]: r for r in result}
    assert by_id["a"]["delta"] > 0
    assert by_id["b"]["delta"] < 0
    assert by_id["a"]["before"] + by_id["a"]["delta"] == by_id["a"]["after"]


def test_compute_elo_changes_draw_near_equal_scores():
    players = [
        {
            "player_id": "a",
            "current_elo": DEFAULT_ELO,
            "chain_score": 0.5,
        },
        {
            "player_id": "b",
            "current_elo": DEFAULT_ELO,
            "chain_score": 0.52,
        },
    ]
    result = compute_elo_changes(players)
    assert all(abs(r["delta"]) <= 2 for r in result)


def test_finish_game_reveal_includes_elo_when_scoring_works(completed_room):
    hub = GameHub()
    broadcasts: list[tuple[str, dict]] = []

    async def capture_broadcast(_room, event, data):
        broadcasts.append((event, data))

    hub._broadcast = capture_broadcast  # type: ignore[method-assign]

    fake_scores = [
        ChainScore(chain_index=0, overall_score=1.0, notes="perfect"),
        ChainScore(chain_index=1, overall_score=0.5, notes="ok"),
        ChainScore(chain_index=2, overall_score=0.3, notes="weak"),
    ]

    with patch.object(hub, "_score_chains_safe", AsyncMock(return_value=fake_scores)):
        asyncio.run(hub._finish_game(completed_room))

    payload = next(d for ev, d in broadcasts if ev == "game:reveal")
    assert "elo" in payload
    assert len(payload["elo"]) == 3
    assert all("playerId" in row and "delta" in row for row in payload["elo"])
