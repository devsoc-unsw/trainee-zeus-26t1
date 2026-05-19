"""Scenario tests for AI judge stubs, schemas, and manager wiring.

Covers acceptance criteria from:
  docs/superpowers/specs/2026-05-16-ai-judge-judge0-stubs.md
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.game.code_execution import run_code
from app.game.manager import GameHub
from app.game.room import round_type_for_num
from app.game.schemas import ChainScore, TestCase as JudgeTestCase
from app.game.schemas import TestResult as JudgeTestResult
from app.game.scoring import score_chain
from tests.conftest import make_three_player_room


# --- Schema wire format ---


def test_chain_score_serializes_camel_case():
    row = ChainScore(chain_index=0, overall_score=0.87, notes="Same logic")
    dumped = row.model_dump(mode="json", by_alias=True)
    assert dumped == {
        "chainIndex": 0,
        "overallScore": 0.87,
        "notes": "Same logic",
    }


def test_judge_test_result_serializes_camel_case():
    row = JudgeTestResult(
        passed=True,
        actual_stdout="ok\n",
        runtime_ms=12,
        error=None,
    )
    dumped = row.model_dump(mode="json", by_alias=True)
    assert dumped["actualStdout"] == "ok\n"
    assert dumped["runtimeMs"] == 12


# --- Stub modules (teammate fills bodies later) ---


def test_score_chain_raises_without_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
        asyncio.run(score_chain([]))


def test_score_chain_parses_gemini_response(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    mock_response = type("R", (), {"text": '{"overall_score": 0.87, "notes": "Same logic"}'})()

    async def fake_generate(*_args, **_kwargs):
        return mock_response

    mock_aio = type("Aio", (), {})()
    mock_aio.models = type("M", (), {"generate_content": fake_generate})()
    mock_client = type("C", (), {"aio": mock_aio})()

    with patch("app.game.scoring.genai.Client", return_value=mock_client):
        chain = {
            "segments": [
                {"roundType": "code", "content": "def a(): pass"},
                {"roundType": "describe", "content": "desc"},
                {"roundType": "code", "content": "def b(): pass"},
            ],
        }
        result = asyncio.run(score_chain([chain]))

    assert len(result) == 1
    assert result[0].overall_score == pytest.approx(0.87)
    assert result[0].notes == "Same logic"


def test_run_code_raises_not_implemented():
    with pytest.raises(NotImplementedError, match="run_code"):
        asyncio.run(
            run_code(
                "print(1)",
                "python",
                [JudgeTestCase(stdin="", expectedStdout="1\n")],
            )
        )


# --- _score_chains_safe scenarios ---


def test_score_chains_safe_catches_missing_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    result = asyncio.run(GameHub()._score_chains_safe([]))
    assert result is None


def test_score_chains_safe_catches_runtime_error():
    async def boom(_chains):
        raise RuntimeError("GEMINI_API_KEY is not set")

    hub = GameHub()
    with patch("app.game.scoring.score_chain", boom):
        result = asyncio.run(hub._score_chains_safe([]))
    assert result is None


def test_score_chains_safe_returns_scores_when_implemented():
    fake_scores = [
        ChainScore(chain_index=0, overall_score=0.9, notes="close"),
        ChainScore(chain_index=1, overall_score=0.5, notes="ok"),
    ]

    async def fake_score(_chains):
        return fake_scores

    hub = GameHub()
    with patch("app.game.scoring.score_chain", fake_score):
        result = asyncio.run(hub._score_chains_safe([{"segments": []}]))
    assert result == fake_scores


# --- Chain payload shape (Player A original vs Player C reconstruct) ---


def test_chains_payload_one_chain_per_player(completed_room):
    hub = GameHub()
    chains = hub._chains_payload(completed_room)
    assert len(chains) == 3


def test_chains_payload_segment_round_types(completed_room):
    hub = GameHub()
    chains = hub._chains_payload(completed_room)
    for chain in chains:
        types = [s["roundType"] for s in chain["segments"]]
        assert types == ["code", "describe", "code"]


def test_chains_payload_player_a_original_and_player_c_reconstruct(completed_room):
    """Chain 0: Jordan (A) writes round-1 code; Lukas (C) writes round-3 code."""
    hub = GameHub()
    chain = hub._chains_payload(completed_room)[0]
    p1 = completed_room.rotation_order[0]
    p3 = completed_room.rotation_order[2]

    original = chain["segments"][0]
    assert original["roundNum"] == 1
    assert original["roundType"] == "code"
    assert original["authorId"] == p1
    assert "reverse_string" in original["content"]
    assert original["language"] == "python"

    reconstructed = next(
        s for s in reversed(chain["segments"]) if s["roundType"] == "code"
    )
    assert reconstructed["roundNum"] == 3
    assert reconstructed["authorId"] == p3
    assert "flip" in reconstructed["content"]
    assert reconstructed["language"] == "javascript"

    describe_seg = chain["segments"][1]
    assert describe_seg["roundType"] == "describe"
    assert describe_seg.get("language") is None


def test_round_type_for_num_matches_game_phases():
    assert round_type_for_num(1) == "code"
    assert round_type_for_num(2) == "describe"
    assert round_type_for_num(3) == "code"
    assert round_type_for_num(5) == "code"


# --- Persistence row builder ---


def test_build_chain_score_rows_none_when_scoring_skipped(completed_room):
    hub = GameHub()
    assert hub._build_chain_score_rows(completed_room, None) is None


def test_build_chain_score_rows_maps_start_player(completed_room):
    hub = GameHub()
    scores = [
        ChainScore(chain_index=0, overall_score=0.87, notes="n0"),
        ChainScore(chain_index=1, overall_score=0.55, notes="n1"),
    ]
    rows = hub._build_chain_score_rows(completed_room, scores)
    assert rows is not None
    assert len(rows) == 2
    assert rows[0]["chain_index"] == 0
    assert rows[0]["start_player_id"] == completed_room.rotation_order[0]
    assert rows[0]["overall_score"] == 0.87
    assert rows[1]["start_player_id"] == completed_room.rotation_order[1]


# --- Reveal payload assembly ---


def test_finish_game_reveal_payload_without_scores_when_stub(completed_room):
    """Acceptance: game:reveal has chains, no scores field, when stub raises."""
    hub = GameHub()
    broadcasts: list[tuple[str, dict]] = []

    async def capture_broadcast(_room, event, data):
        broadcasts.append((event, data))

    hub._broadcast = capture_broadcast  # type: ignore[method-assign]
    completed_room.status = "active"

    with patch.object(hub, "_score_chains_safe", AsyncMock(return_value=None)):
        asyncio.run(hub._finish_game(completed_room))

    reveal_events = [d for ev, d in broadcasts if ev == "game:reveal"]
    assert len(reveal_events) == 1
    payload = reveal_events[0]
    assert "chains" in payload
    assert len(payload["chains"]) == 3
    assert "scores" not in payload


def test_finish_game_reveal_payload_includes_scores_when_scoring_works(
    completed_room,
):
    """When score_chain succeeds, scores appear on game:reveal automatically."""
    hub = GameHub()
    broadcasts: list[tuple[str, dict]] = []

    async def capture_broadcast(_room, event, data):
        broadcasts.append((event, data))

    hub._broadcast = capture_broadcast  # type: ignore[method-assign]

    fake_scores = [
        ChainScore(chain_index=0, overall_score=0.87, notes="match"),
    ]

    with patch.object(hub, "_score_chains_safe", AsyncMock(return_value=fake_scores)):
        asyncio.run(hub._finish_game(completed_room))

    payload = next(d for ev, d in broadcasts if ev == "game:reveal")
    assert "scores" in payload
    assert payload["scores"] == [
        {"chainIndex": 0, "overallScore": 0.87, "notes": "match"},
    ]
