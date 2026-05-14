import pytest
from fastapi.testclient import TestClient


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


@pytest.fixture
def game_client(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")
    from app.game.manager import hub

    hub.reset_for_tests()
    from app.main import app

    with TestClient(app) as client:
        yield client
    hub.reset_for_tests()


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

            w1.send_json({"event": "round:submit", "data": {"content": f"c1r{round_num}"}})
            w2.send_json({"event": "round:submit", "data": {"content": f"c2r{round_num}"}})
            w3.send_json({"event": "round:submit", "data": {"content": f"c3r{round_num}"}})

            _drain_until(w1, "round:ended")
            _drain_until(w2, "round:ended")
            _drain_until(w3, "round:ended")

        reveal1 = _next_event(w1, "game:reveal")
        reveal2 = _next_event(w2, "game:reveal")
        reveal3 = _next_event(w3, "game:reveal")
        for rev in (reveal1, reveal2, reveal3):
            assert len(rev["chains"]) == 3

        _next_event(w1, "game:over")
        _next_event(w2, "game:over")
        _next_event(w3, "game:over")

        w1.send_json({"event": "game:reset", "data": {}})
        upd = _next_event(w1, "room:updated")
        assert len(upd["players"]) == 3


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
