"""
Three-player workflow tests — lobby through reveal with realistic telephone payloads.

Workflow (fixed player order when random.shuffle is patched):
  Round 1 (code):    each player writes code
  Round 2 (describe): each player describes upstream's round-1 code
  Round 3 (code):    each player reimplements from upstream's description

Focal chain (starter Jordan): original reverse_string → describe → flip reconstruction.
"""

from __future__ import annotations

import random

import pytest

from tests.ws_workflow import (
    ORIGINAL_CODE,
    RECONSTRUCT_CODE,
    assert_focal_chain,
    find_chain,
    run_three_player_workflow,
)


@pytest.fixture
def fixed_rotation(monkeypatch):
    """Keep rotation_order == join order [host, guest1, guest2]."""
    monkeypatch.setattr(random, "shuffle", lambda xs: None)


@pytest.fixture
def fast_game(monkeypatch):
    monkeypatch.setattr("app.game.manager.fetch_random_prompt_text", lambda: "Reverse a string")
    monkeypatch.setattr("app.game.manager.REVEAL_TO_OVER_SEC", 0.05)
    monkeypatch.setattr(
        "app.game.manager.DEFAULT_TIME_LIMITS",
        {"code": 120, "describe": 120},
    )


def test_three_player_workflow_reveal_chain_content(
    game_client, fixed_rotation, fast_game
):
    """Full WS game: reveal chains carry real submissions for the telephone chain."""

    with (
        game_client.websocket_connect("/ws/game") as w1,
        game_client.websocket_connect("/ws/game") as w2,
        game_client.websocket_connect("/ws/game") as w3,
    ):
        reveal = run_three_player_workflow(
            lambda: (w1, w2, w3),
            host_name="Jordan",
            guest_names=("Amrita", "Lukas"),
        )

    chains = reveal["chains"]
    assert len(chains) == 3

    jordan_chain = find_chain(chains, "Jordan")
    assert jordan_chain is not None
    segs = jordan_chain["segments"]
    assert segs[0]["authorName"] == "Jordan"
    assert segs[0]["content"].strip() == ORIGINAL_CODE.strip()
    last_code = next(s for s in reversed(segs) if s["roundType"] == "code")
    assert last_code["authorName"] == "Lukas"
    assert "flip" in last_code["content"]

    assert_focal_chain(chains, "Jordan")


def test_three_player_workflow_phase_sequence(game_client, fixed_rotation, fast_game):
    """Each round:begin has correct roundNum and roundType for all players."""

    phase_log: list[tuple[int, str]] = []

    def on_round_begin(round_num, round_type, players):
        for p in players:
            begin = next(
                m["data"]
                for m in reversed(p.inbox)
                if m.get("event") == "round:begin"
            )
            assert begin["roundNum"] == round_num
            assert begin["roundType"] == round_type
        phase_log.append((round_num, round_type))

    with (
        game_client.websocket_connect("/ws/game") as w1,
        game_client.websocket_connect("/ws/game") as w2,
        game_client.websocket_connect("/ws/game") as w3,
    ):
        run_three_player_workflow(
            lambda: (w1, w2, w3),
            on_round_begin=on_round_begin,
        )

    assert phase_log == [
        (1, "code"),
        (2, "describe"),
        (3, "code"),
    ]


def test_three_player_workflow_reimplement_seed_has_description(
    game_client, fixed_rotation, fast_game
):
    """Player C (Lukas) in round 3 receives a description seed, not empty."""

    lukas_seeds: list[dict] = []

    def on_round_begin(round_num, round_type, players):
        if round_num == 3:
            lukas = next(p for p in players if p.name == "Lukas")
            begin = next(
                m["data"]
                for m in reversed(lukas.inbox)
                if m.get("event") == "round:begin"
            )
            lukas_seeds.append(begin.get("seed") or {})

    with (
        game_client.websocket_connect("/ws/game") as w1,
        game_client.websocket_connect("/ws/game") as w2,
        game_client.websocket_connect("/ws/game") as w3,
    ):
        run_three_player_workflow(
            lambda: (w1, w2, w3),
            on_round_begin=on_round_begin,
        )

    assert len(lukas_seeds) == 1
    received = lukas_seeds[0].get("receivedContent") or ""
    assert len(received) > 10
    assert "reverse" in received.lower() or "character" in received.lower()
