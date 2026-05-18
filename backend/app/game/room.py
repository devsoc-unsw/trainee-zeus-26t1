from __future__ import annotations

import asyncio
import secrets
import string
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from app.game.schemas import PlayerPublic, RoundType, camelize_model

CODE_ALPHABET = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"
CODE_ALPHABET = "".join(c for c in CODE_ALPHABET if c not in {"0", "1"})

DEFAULT_TIME_LIMITS: dict[str, int] = {"code": 120, "describe": 60}
REVEAL_TO_OVER_SEC = 15.0

STARTER_LINES = [
    "def solution(nums: list[int]) -> int:",
    "// TODO: handle edge cases",
    "class Solver:",
    "fn main() {",
    "SELECT * FROM mystery WHERE id = ?;",
    "# Your implementation starts here",
]

GameStatus = Literal["lobby", "active", "over"]


def new_room_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


def new_id() -> str:
    return str(uuid.uuid4())


@dataclass
class Player:
    id: str
    name: str
    is_host: bool
    socket: Any | None = None
    connected: bool = True


@dataclass
class Room:
    id: str
    code: str
    host_id: str
    players: dict[str, Player]
    player_order: list[str]
    status: GameStatus = "lobby"
    round_count: int = 3
    game_mode: str = "classic"
    rotation_order: list[str] = field(default_factory=list)
    current_round: int = 0
    current_round_type: RoundType | None = None
    round_started_at: float | None = None
    round_time_limit: int | None = None
    prompt_text: str = ""
    starter_line: str = ""
    submissions: dict[int, dict[str, str]] = field(default_factory=dict)
    submitted_this_round: set[str] = field(default_factory=set)
    timer_task: asyncio.Task | None = None
    over_task: asyncio.Task | None = None
    ended_rounds: set[int] = field(default_factory=set)
    reveal_chains: list[dict[str, Any]] | None = None
    reveal_scores: list[dict[str, Any]] | None = None
    reveal_elo: list[dict[str, Any]] | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def public_players(self) -> list[dict[str, Any]]:
        return [
            camelize_model(
                PlayerPublic(
                    id=p.id,
                    name=p.name,
                    isHost=p.id == self.host_id,
                )
            )
            for p in self.players_in_join_order()
        ]

    def players_in_join_order(self) -> list[Player]:
        return [self.players[pid] for pid in self.player_order if pid in self.players]

    def rotation_index(self, player_id: str) -> int:
        if not self.rotation_order:
            return -1
        return self.rotation_order.index(player_id)

    def upstream_id(self, player_id: str) -> str | None:
        if not self.rotation_order:
            return None
        idx = self.rotation_index(player_id)
        if idx < 0:
            return None
        return self.rotation_order[(idx - 1) % len(self.rotation_order)]


def now_ms() -> int:
    return int(time.time() * 1000)


def round_type_for_num(round_num: int) -> RoundType:
    return "code" if round_num % 2 == 1 else "describe"
