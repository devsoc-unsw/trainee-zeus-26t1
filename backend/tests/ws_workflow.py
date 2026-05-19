"""WebSocket helpers and 3-player Code Telephone workflow (shared by tests and scripts)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable

# Canonical telephone payloads (reverse-a-string) — one chain per starter.
ORIGINAL_CODE = "def reverse_string(s):\n    return s[::-1]\n"
DESCRIBE_ORIGINAL = (
    "Takes a string and returns the same characters in reverse order."
)
RECONSTRUCT_CODE = "def flip(text):\n    return text[::-1]\n"

# Placeholder round-1 submissions for players who are not the focal chain starter.
OTHER_R1_CODE = "def other_starter():\n    return 0\n"


@dataclass
class PlayerScript:
    name: str
    ws: Any
    player_id: str | None = None
    inbox: list[dict[str, Any]] = field(default_factory=list)

    def send(self, event: str, data: dict[str, Any] | None = None) -> None:
        self.ws.send_json({"event": event, "data": data or {}})

    def drain_into_inbox(self, max_frames: int = 50) -> None:
        for _ in range(max_frames):
            try:
                msg = self.ws.receive_json()
            except Exception:
                break
            self.inbox.append(msg)

    def wait_event(self, want: str, max_iter: int = 200) -> dict[str, Any]:
        for _ in range(max_iter):
            msg = self.ws.receive_json()
            self.inbox.append(msg)
            if msg.get("event") == want:
                return msg.get("data") or {}
        raise AssertionError(f"{self.name}: did not receive {want}")

    def drain_until(self, want: str, max_iter: int = 200) -> dict[str, Any]:
        """Read frames until `want` (ignore other events — e.g. round:begin for next round)."""
        for _ in range(max_iter):
            msg = self.ws.receive_json()
            self.inbox.append(msg)
            if msg.get("event") == want:
                return msg.get("data") or {}
        raise AssertionError(f"{self.name}: did not receive {want}")


def ws_url_from_base(base: str) -> str:
    base = base.rstrip("/")
    if base.startswith("https://"):
        return "wss://" + base.removeprefix("https://") + "/ws/game"
    if base.startswith("http://"):
        return "ws://" + base.removeprefix("http://") + "/ws/game"
    return "ws://" + base + "/ws/game"


def language_for_round(
    player_name: str,
    round_type: str,
    *,
    code_languages: dict[str, str] | None = None,
) -> str | None:
    """Language sent on round:submit for code rounds; None for describe."""
    if round_type != "code":
        return None
    if code_languages and player_name in code_languages:
        return code_languages[player_name]
    return "python"


def submission_for_round(
    player_name: str,
    round_num: int,
    round_type: str,
    *,
    player_order: tuple[str, str, str],
) -> str:
    """
    Content each player submits when rotation order equals join order
    (host, guest1, guest2).

    Focal chain (starter = player_order[0]):
      r1 — A writes ORIGINAL_CODE
      r2 — B describes A's code
      r3 — C reimplements from B's description
    """
    starter, describer, reimplementer = player_order
    if round_num == 1 and round_type == "code":
        return ORIGINAL_CODE if player_name == starter else OTHER_R1_CODE
    if round_num == 2 and round_type == "describe":
        if player_name == describer:
            return DESCRIBE_ORIGINAL
        return f"{player_name} describes upstream code for round 2."
    if round_num == 3 and round_type == "code":
        if player_name == reimplementer:
            return RECONSTRUCT_CODE
        return f"# {player_name} reconstruction placeholder\npass\n"
    return f"{player_name} r{round_num}"


def find_chain(chains: list[dict[str, Any]], starter_name: str) -> dict[str, Any] | None:
    for c in chains:
        if c.get("startPlayerName") == starter_name:
            return c
    return None


def assert_focal_chain(chains: list[dict[str, Any]], starter_name: str) -> None:
    chain = find_chain(chains, starter_name)
    assert chain is not None, f"no chain for starter {starter_name}"
    segments = chain["segments"]
    assert len(segments) == 3
    assert segments[0]["roundType"] == "code"
    assert segments[0]["authorName"] == starter_name
    assert ORIGINAL_CODE.strip() in (segments[0].get("content") or "")
    last_code = next(s for s in reversed(segments) if s["roundType"] == "code")
    assert "flip" in (last_code.get("content") or "") or RECONSTRUCT_CODE.strip() in (
        last_code.get("content") or ""
    )


def run_three_player_workflow(
    connect_fn: Callable[[], tuple[Any, Any, Any]],
    *,
    host_name: str = "Jordan",
    guest_names: tuple[str, str] = ("Amrita", "Lukas"),
    round_count: int = 3,
    code_languages: dict[str, str] | None = None,
    on_round_begin: Callable[[int, str, list[PlayerScript]], None] | None = None,
) -> dict[str, Any]:
    """
    Drive lobby → 3 rounds → reveal for three connected WebSocket clients.

    `connect_fn` must return three open websocket-like objects (e.g. TestClient
    context managers already entered).

    Returns the `game:reveal` payload seen by the host.
    """
    w1, w2, w3 = connect_fn()
    host = PlayerScript(host_name, w1)
    guests = [PlayerScript(guest_names[0], w2), PlayerScript(guest_names[1], w3)]
    all_players = [host, *guests]
    player_order = (host_name, guest_names[0], guest_names[1])

    host.send("room:create", {"name": host_name, "roundCount": round_count})
    created = host.wait_event("room:created")
    code = created["code"]
    host.player_id = created["playerId"]

    g1, g2 = guests
    g1.send("room:join", {"code": code, "name": g1.name})
    g1.wait_event("room:joined")
    host.wait_event("room:updated")

    g2.send("room:join", {"code": code, "name": g2.name})
    g2.wait_event("room:joined")
    host.wait_event("room:updated")
    g1.wait_event("room:updated")

    host.send("game:start", {})
    for p in all_players:
        p.wait_event("game:started")

    for round_num in (1, 2, 3):
        round_type = "code" if round_num % 2 == 1 else "describe"
        begins: list[dict[str, Any]] = []
        for p in all_players:
            begins.append(p.wait_event("round:begin"))
        if on_round_begin:
            on_round_begin(round_num, round_type, all_players)
        for p, begin in zip(all_players, begins, strict=True):
            assert begin["roundNum"] == round_num
            content = submission_for_round(
                p.name, round_num, round_type, player_order=player_order
            )
            payload: dict[str, Any] = {"content": content}
            lang = language_for_round(
                p.name, round_type, code_languages=code_languages
            )
            if lang:
                payload["language"] = lang
            p.send("round:submit", payload)
        for p in all_players:
            p.drain_until("round:ended")

    reveal = host.wait_event("game:reveal")
    for g in guests:
        g.wait_event("game:reveal")
    return reveal
