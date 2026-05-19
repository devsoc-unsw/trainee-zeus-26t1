import pytest


def _next_event(ws, want: str, max_iter: int = 200):
    for _ in range(max_iter):
        msg = ws.receive_json()
        if msg.get("event") == want:
            return msg.get("data") or {}
    raise AssertionError(f"did not receive {want}")


def _drain_until(ws, want: str, max_iter: int = 200):
    for _ in range(max_iter):
        msg = ws.receive_json()
        if msg.get("event") == want:
            return msg.get("data") or {}
    raise AssertionError(f"did not drain to {want}")


def test_room_join_room_not_found(game_client):
    with game_client.websocket_connect("/ws/game") as ws:
        ws.send_json({"event": "room:join", "data": {"code": "ZZZZZZ", "name": "X"}})
        err = _next_event(ws, "room:error")
        assert err["code"] == "ROOM_NOT_FOUND"


def test_name_taken(game_client):
    code = None
    with game_client.websocket_connect("/ws/game") as w1, game_client.websocket_connect("/ws/game") as w2:
        w1.send_json({"event": "room:create", "data": {"name": "Host", "roundCount": 3}})
        created = _next_event(w1, "room:created")
        code = created["code"]
        w2.send_json({"event": "room:join", "data": {"code": code, "name": "Guest"}})
        _next_event(w2, "room:joined")
        w2.close()
    with game_client.websocket_connect("/ws/game") as w3:
        w3.send_json({"event": "room:join", "data": {"code": code, "name": "guest"}})
        err = _next_event(w3, "room:error")
        assert err["code"] == "NAME_TAKEN"


def test_not_enough_players(game_client, monkeypatch):
    monkeypatch.setattr("app.game.manager.fetch_random_prompt_text", lambda: "P")
    with game_client.websocket_connect("/ws/game") as w1, game_client.websocket_connect("/ws/game") as w2:
        w1.send_json({"event": "room:create", "data": {"name": "A", "roundCount": 3}})
        c = _next_event(w1, "room:created")
        code = c["code"]
        w2.send_json({"event": "room:join", "data": {"code": code, "name": "B"}})
        _next_event(w2, "room:joined")
        _next_event(w1, "room:updated")
        w1.send_json({"event": "game:start", "data": {}})
        err = _next_event(w1, "room:error")
        assert err["code"] == "NOT_ENOUGH_PLAYERS"


def test_three_player_happy_path(game_client, monkeypatch):
    monkeypatch.setattr("app.game.manager.fetch_random_prompt_text", lambda: "Write hello world")
    monkeypatch.setattr("app.game.manager.REVEAL_TO_OVER_SEC", 0.05)
    monkeypatch.setattr("app.game.manager.DEFAULT_TIME_LIMITS", {"code": 120, "describe": 120})

    async def no_scores(_chains):
        return None

    monkeypatch.setattr("app.game.scoring.score_chain", no_scores)

    with (
        game_client.websocket_connect("/ws/game") as w1,
        game_client.websocket_connect("/ws/game") as w2,
        game_client.websocket_connect("/ws/game") as w3,
    ):
        w1.send_json({"event": "room:create", "data": {"name": "A", "roundCount": 3}})
        c1 = _next_event(w1, "room:created")
        code = c1["code"]

        w2.send_json({"event": "room:join", "data": {"code": code, "name": "B"}})
        _next_event(w2, "room:joined")
        _next_event(w1, "room:updated")

        w3.send_json({"event": "room:join", "data": {"code": code, "name": "C"}})
        _next_event(w3, "room:joined")
        _next_event(w1, "room:updated")
        _next_event(w2, "room:updated")

        w1.send_json({"event": "game:start", "data": {}})

        for w in (w1, w2, w3):
            gs = _next_event(w, "game:started")
            assert gs["roundCount"] == 3
            assert "timeLimits" in gs

        for round_num in (1, 2, 3):
            rb1 = _next_event(w1, "round:begin")
            rb2 = _next_event(w2, "round:begin")
            rb3 = _next_event(w3, "round:begin")
            for rb in (rb1, rb2, rb3):
                assert rb["roundNum"] == round_num

            if round_num == 1:
                assert rb1["seed"].get("promptText")

            submit_data = lambda c: {"content": f"c{c}r{round_num}", "language": "python"}
            w1.send_json({"event": "round:submit", "data": submit_data(1)})
            w2.send_json({"event": "round:submit", "data": submit_data(2)})
            w3.send_json({"event": "round:submit", "data": submit_data(3)})

            ended1 = _drain_until(w1, "round:ended")
            _drain_until(w2, "round:ended")
            _drain_until(w3, "round:ended")
            if round_num in (1, 3):
                code_subs = [
                    s for s in ended1["submissions"] if s.get("roundType") == "code"
                ]
                assert code_subs
                assert all(s.get("language") == "python" for s in code_subs)
            else:
                assert all(s.get("language") is None for s in ended1["submissions"])

        reveal1 = _next_event(w1, "game:reveal")
        reveal2 = _next_event(w2, "game:reveal")
        reveal3 = _next_event(w3, "game:reveal")
        for rev in (reveal1, reveal2, reveal3):
            assert len(rev["chains"]) == 3
            assert "scores" not in rev
            for chain in rev["chains"]:
                for seg in chain["segments"]:
                    if seg["roundType"] == "code":
                        assert seg.get("language") == "python"
                    else:
                        assert seg.get("language") is None

        _next_event(w1, "game:over")
        _next_event(w2, "game:over")
        _next_event(w3, "game:over")

        w1.send_json({"event": "game:reset", "data": {}})
        upd = _next_event(w1, "room:updated")
        assert len(upd["players"]) == 3


def test_reveal_segments_carry_per_player_language(game_client, monkeypatch):
    """Code segments on game:reveal reflect each player's round:submit language."""
    monkeypatch.setattr("app.game.manager.fetch_random_prompt_text", lambda: "P")
    monkeypatch.setattr("app.game.manager.REVEAL_TO_OVER_SEC", 0.05)
    monkeypatch.setattr("app.game.manager.DEFAULT_TIME_LIMITS", {"code": 120, "describe": 120})
    # Keep rotation order = join order so chain geometry is predictable.
    monkeypatch.setattr("app.game.manager.random.shuffle", lambda _lst: None)

    async def no_scores(_chains):
        return None

    monkeypatch.setattr("app.game.scoring.score_chain", no_scores)

    with (
        game_client.websocket_connect("/ws/game") as w1,
        game_client.websocket_connect("/ws/game") as w2,
        game_client.websocket_connect("/ws/game") as w3,
    ):
        w1.send_json({"event": "room:create", "data": {"name": "A", "roundCount": 3}})
        code = _next_event(w1, "room:created")["code"]
        w2.send_json({"event": "room:join", "data": {"code": code, "name": "B"}})
        _next_event(w2, "room:joined")
        _next_event(w1, "room:updated")
        w3.send_json({"event": "room:join", "data": {"code": code, "name": "C"}})
        _next_event(w3, "room:joined")
        _next_event(w1, "room:updated")
        _next_event(w2, "room:updated")

        w1.send_json({"event": "game:start", "data": {}})
        for w in (w1, w2, w3):
            _next_event(w, "game:started")

        # Round 1 (code): A=python, B=javascript, C=java
        for w in (w1, w2, w3):
            _next_event(w, "round:begin")
        w1.send_json(
            {"event": "round:submit", "data": {"content": "def a(): pass", "language": "python"}}
        )
        w2.send_json(
            {
                "event": "round:submit",
                "data": {"content": "function b() {}", "language": "javascript"},
            }
        )
        w3.send_json(
            {
                "event": "round:submit",
                "data": {"content": "class C {}", "language": "java"},
            }
        )
        _drain_until(w1, "round:ended")
        _drain_until(w2, "round:ended")
        _drain_until(w3, "round:ended")

        # Round 2 (describe) — no language on wire
        for w in (w1, w2, w3):
            _next_event(w, "round:begin")
        w1.send_json({"event": "round:submit", "data": {"content": "desc a"}})
        w2.send_json({"event": "round:submit", "data": {"content": "desc b"}})
        w3.send_json({"event": "round:submit", "data": {"content": "desc c"}})
        _drain_until(w1, "round:ended")
        _drain_until(w2, "round:ended")
        _drain_until(w3, "round:ended")

        # Round 3 (code)
        for w in (w1, w2, w3):
            _next_event(w, "round:begin")
        w1.send_json(
            {"event": "round:submit", "data": {"content": "def a2(): pass", "language": "java"}}
        )
        w2.send_json(
            {
                "event": "round:submit",
                "data": {"content": "function b2() {}", "language": "python"},
            }
        )
        w3.send_json(
            {
                "event": "round:submit",
                "data": {"content": "class C2 {}", "language": "javascript"},
            }
        )
        _drain_until(w1, "round:ended")
        _drain_until(w2, "round:ended")
        _drain_until(w3, "round:ended")

        reveal = _next_event(w1, "game:reveal")
        # Join order A → B → C; shuffle disabled → chain for starter A is A→B→C.
        chain_a = next(c for c in reveal["chains"] if c["startPlayerName"] == "A")
        r1_a = next(s for s in chain_a["segments"] if s["roundNum"] == 1)
        r3_c = next(
            s
            for s in chain_a["segments"]
            if s["roundNum"] == 3 and s["authorName"] == "C"
        )
        assert r1_a["language"] == "python"
        assert r1_a["authorName"] == "A"
        assert r3_c["language"] == "javascript"
        describe_seg = next(s for s in chain_a["segments"] if s["roundType"] == "describe")
        assert describe_seg.get("language") is None
        assert describe_seg["authorName"] == "B"


def test_round_submit_defaults_language_python(game_client, monkeypatch):
    """Omitting language on a code round still stores python."""
    monkeypatch.setattr("app.game.manager.fetch_random_prompt_text", lambda: "P")
    monkeypatch.setattr("app.game.manager.REVEAL_TO_OVER_SEC", 0.05)
    monkeypatch.setattr("app.game.manager.DEFAULT_TIME_LIMITS", {"code": 120, "describe": 120})

    with (
        game_client.websocket_connect("/ws/game") as w1,
        game_client.websocket_connect("/ws/game") as w2,
        game_client.websocket_connect("/ws/game") as w3,
    ):
        w1.send_json({"event": "room:create", "data": {"name": "A", "roundCount": 3}})
        code = _next_event(w1, "room:created")["code"]
        for w, name in ((w2, "B"), (w3, "C")):
            w.send_json({"event": "room:join", "data": {"code": code, "name": name}})
            _next_event(w, "room:joined")
            _next_event(w1, "room:updated")
        _next_event(w2, "room:updated")

        w1.send_json({"event": "game:start", "data": {}})
        for w in (w1, w2, w3):
            _next_event(w, "game:started")
        for w in (w1, w2, w3):
            _next_event(w, "round:begin")
        w1.send_json({"event": "round:submit", "data": {"content": "x"}})
        w2.send_json({"event": "round:submit", "data": {"content": "y"}})
        w3.send_json({"event": "round:submit", "data": {"content": "z"}})
        ended = _drain_until(w1, "round:ended")
        assert all(s.get("language") == "python" for s in ended["submissions"])


def test_game_sync(monkeypatch, game_client):
    monkeypatch.setattr("app.game.manager.fetch_random_prompt_text", lambda: "P")
    room_id = None
    player_id = None
    with game_client.websocket_connect("/ws/game") as w1:
        w1.send_json({"event": "room:create", "data": {"name": "Solo", "roundCount": 3}})
        c = _next_event(w1, "room:created")
        room_id = c["roomId"]
        player_id = c["playerId"]
        w1.close()

    with game_client.websocket_connect("/ws/game") as w2:
        w2.send_json(
            {
                "event": "game:sync",
                "data": {"roomId": room_id, "playerId": player_id},
            }
        )
        st = _next_event(w2, "game:state")
        assert st["status"] == "lobby"
        assert st["roundNum"] == 0


def test_game_reveal_includes_scores_when_scoring_implemented(game_client, monkeypatch):
    """When score_chain is implemented, game:reveal must carry scores per chain."""
    from app.game.schemas import ChainScore

    monkeypatch.setattr("app.game.manager.fetch_random_prompt_text", lambda: "P")
    monkeypatch.setattr("app.game.manager.REVEAL_TO_OVER_SEC", 0.05)
    monkeypatch.setattr("app.game.manager.DEFAULT_TIME_LIMITS", {"code": 120, "describe": 120})

    async def fake_score_chain(chains):
        return [
            ChainScore(chain_index=i, overall_score=0.8 - i * 0.1, notes=f"chain {i}")
            for i in range(len(chains))
        ]

    monkeypatch.setattr("app.game.scoring.score_chain", fake_score_chain)

    with (
        game_client.websocket_connect("/ws/game") as w1,
        game_client.websocket_connect("/ws/game") as w2,
        game_client.websocket_connect("/ws/game") as w3,
    ):
        w1.send_json({"event": "room:create", "data": {"name": "A", "roundCount": 3}})
        code = _next_event(w1, "room:created")["code"]
        w2.send_json({"event": "room:join", "data": {"code": code, "name": "B"}})
        _next_event(w2, "room:joined")
        _next_event(w1, "room:updated")
        w3.send_json({"event": "room:join", "data": {"code": code, "name": "C"}})
        _next_event(w3, "room:joined")
        _next_event(w1, "room:updated")
        _next_event(w2, "room:updated")

        w1.send_json({"event": "game:start", "data": {}})
        for w in (w1, w2, w3):
            _next_event(w, "game:started")

        for _ in range(3):
            for w in (w1, w2, w3):
                _next_event(w, "round:begin")
            w1.send_json({"event": "round:submit", "data": {"content": "a"}})
            w2.send_json({"event": "round:submit", "data": {"content": "b"}})
            w3.send_json({"event": "round:submit", "data": {"content": "c"}})
            _drain_until(w1, "round:ended")
            _drain_until(w2, "round:ended")
            _drain_until(w3, "round:ended")

        reveal = _next_event(w1, "game:reveal")
        assert len(reveal["chains"]) == 3
        assert len(reveal["scores"]) == 3
        assert reveal["scores"][0]["chainIndex"] == 0
        assert reveal["scores"][0]["overallScore"] == pytest.approx(0.8)
